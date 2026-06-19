import { PlatformAccessory, Service, API } from 'homebridge';

import {
  defaultPricesCache,
  defaultAreaTimezone,
  fnc_todayKey,
  fnc_tomorrowKey,
} from './settings';

import { schedule } from 'node-cron';
import { NordpoolPlatform } from './platform';
import { DateTime } from 'luxon';

// Load Fakegato-history for Eve app support
const FakeGatoHistoryService = require('fakegato-history');

type PricePoint = {
  day: number;
  hour: number;
  price: number;
};

type PricePointWithDate = PricePoint & {
  dateKey: string;
};

type DeviceConfig = {
  name: string;
  cheapestHours: number | string;
  rangeStart: number | string;
  rangeEnd: number | string;
};

type OvernightSchedule = {
  windowStart: string;
  windowEnd: string;
  selectedHours: string[];
  allHours: {
    hourKey: string;
    price: number;
    selected: boolean;
  }[];
  createdAt: string;
};

export class NordpoolPlatformAccessory {
  private service: Service;
  private historyService: any;
  private pricesCache;
  private deviceConfig: DeviceConfig;

  constructor(
    private readonly platform: NordpoolPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: API,
  ) {
    this.pricesCache = defaultPricesCache(this.api, this.platform.log);
    this.deviceConfig = accessory.context.device;

    this.deviceConfig = this.normaliseDeviceConfig(this.deviceConfig);
    this.accessory.context.device = this.deviceConfig;

    this.platform.log.info(
      `[${this.deviceConfig.name}] Loaded device config: ${JSON.stringify(this.deviceConfig)}`,
    );

    this.accessory.getService(this.platform.Service.AccessoryInformation)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Nordpool')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dynamic Price Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Use Contact Sensor type in HomeKit
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Fakegato requires the 'door' type for Contact Sensors
    const FakeGatoHistory = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoHistory('door', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: this.api.user.storagePath() + '/accessories',
      filename: `history_${this.accessory.UUID}.json`,
    });

    this.updateStatus();

    schedule('0 * * * *', () => {
      this.platform.log.info(`[${this.deviceConfig.name}] Hourly update triggered.`);
      this.updateStatus();
    });
  }

  async updateStatus(): Promise<void> {
    const todayKey = fnc_todayKey(this.platform.config);
    const tomorrowKey = fnc_tomorrowKey(this.platform.config);

    const cachedToday: PricePoint[] = await this.pricesCache.get(todayKey) || [];
    const cachedTomorrow: PricePoint[] = await this.pricesCache.get(tomorrowKey) || [];

    const todayPrices = this.withDateKey(cachedToday, todayKey);
    const tomorrowPrices = this.withDateKey(cachedTomorrow, tomorrowKey);
    const allPrices = [...todayPrices, ...tomorrowPrices];

    if (allPrices.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      this.setState(false);
      return;
    }

    const isCurrentlyOn = await this.calculateCheapestStatus(allPrices, todayKey, tomorrowKey);

    this.setState(isCurrentlyOn);
  }

  async calculateCheapestStatus(
    allPrices: PricePointWithDate[],
    todayKey: string,
    tomorrowKey: string,
  ): Promise<boolean> {
    const timezone = defaultAreaTimezone(this.platform.config);
    const now = DateTime.local().setZone(timezone).startOf('hour');

    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    this.platform.log.info(
      `[${this.deviceConfig.name}] Calculating with rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, cheapestHours=${cheapestHours}`,
    );

    if (rangeStart <= rangeEnd) {
      return this.calculateSameDayStatus(allPrices, todayKey, now);
    }

    return this.calculateOvernightStatus(allPrices, todayKey, tomorrowKey, now);
  }

  private calculateSameDayStatus(
    allPrices: PricePointWithDate[],
    todayKey: string,
    now: DateTime,
  ): boolean {
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    const targetHours = allPrices.filter(p =>
      p.dateKey === todayKey &&
      p.hour >= rangeStart &&
      p.hour <= rangeEnd,
    );

    if (targetHours.length === 0) {
      this.platform.log.warn(
        `[${this.deviceConfig.name}] No price data for same-day range ${rangeStart}:00-${rangeEnd}:00.`,
      );
      return false;
    }

    const cheapestHoursArray = this.selectCheapestHours(targetHours, cheapestHours);
    this.logSchedule(targetHours, cheapestHoursArray, todayKey, todayKey);

    const currentHourKey = this.hourKey(now);
    return cheapestHoursArray.some(p => this.priceHourKey(p) === currentHourKey);
  }

  private async calculateOvernightStatus(
    allPrices: PricePointWithDate[],
    todayKey: string,
    tomorrowKey: string,
    now: DateTime,
  ): Promise<boolean> {
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    const scheduleKey = this.overnightScheduleCacheKey(todayKey);
    let storedSchedule: OvernightSchedule | undefined = await this.pricesCache.get(scheduleKey);

    if (!storedSchedule) {
      const targetHours = allPrices.filter(p =>
        (p.dateKey === todayKey && p.hour >= rangeStart) ||
        (p.dateKey === tomorrowKey && p.hour <= rangeEnd),
      );

      const expectedHours = this.expectedWindowHourCount(rangeStart, rangeEnd);

      if (targetHours.length < expectedHours) {
        this.platform.log.warn(
          `[${this.deviceConfig.name}] Overnight schedule not created yet. ` +
          `Need ${expectedHours} hours for ${todayKey} ${rangeStart}:00 -> ${tomorrowKey} ${rangeEnd}:00, ` +
          `but only ${targetHours.length} hours are available. Device remains OFF.`,
        );
        return false;
      }

      const cheapestHoursArray = this.selectCheapestHours(targetHours, cheapestHours);

      storedSchedule = {
        windowStart: `${todayKey} ${this.padHour(rangeStart)}:00`,
        windowEnd: `${tomorrowKey} ${this.padHour(rangeEnd)}:00`,
        selectedHours: cheapestHoursArray.map(p => this.priceHourKey(p)),
        allHours: this.sortChronologically(targetHours).map(p => ({
          hourKey: this.priceHourKey(p),
          price: p.price,
          selected: cheapestHoursArray.includes(p),
        })),
        createdAt: now.toISO() || new Date().toISOString(),
      };

      await this.pricesCache.set(scheduleKey, storedSchedule);

      this.platform.log.info(
        `[${this.deviceConfig.name}] Created overnight schedule ${storedSchedule.windowStart} -> ${storedSchedule.windowEnd}.`,
      );
    }

    this.logStoredOvernightSchedule(storedSchedule);

    const currentHourKey = this.hourKey(now);
    const isInsideStoredWindow = storedSchedule.allHours.some(h => h.hourKey === currentHourKey);

    if (!isInsideStoredWindow) {
      return false;
    }

    return storedSchedule.selectedHours.includes(currentHourKey);
  }

  private setState(isCurrentlyOn: boolean): void {
    // Update HomeKit status
    const characteristic = this.platform.Characteristic.ContactSensorState;

    const value = isCurrentlyOn
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.service.updateCharacteristic(characteristic, value);

    // The 'door' type expects the 'status' key (1 = open/cheap, 0 = closed/expensive)
    this.historyService.addEntry({
      time: Math.round(new Date().getTime() / 1000),
      status: isCurrentlyOn ? 1 : 0,
    });

    this.platform.log.info(
      `[${this.deviceConfig.name}] Status update: ${isCurrentlyOn ? 'ON (Cheap)' : 'OFF (Expensive)'}`,
    );
  }

  private selectCheapestHours(
    targetHours: PricePointWithDate[],
    cheapestHours: number,
  ): PricePointWithDate[] {
    return [...targetHours]
      .sort((a, b) => a.price - b.price)
      .slice(0, Math.min(cheapestHours, targetHours.length));
  }

  private logSchedule(
    targetHours: PricePointWithDate[],
    cheapestHoursArray: PricePointWithDate[],
    windowStartDate: string,
    windowEndDate: string,
  ): void {
    const { rangeStart, rangeEnd } = this.deviceConfig;

    const onHours = this.sortChronologically(cheapestHoursArray)
      .map(p => `${p.dateKey} ${this.padHour(p.hour)}:00 (${p.price})`);

    const offHours = this.sortChronologically(
      targetHours.filter(p => !cheapestHoursArray.includes(p)),
    ).map(p => `${p.dateKey} ${this.padHour(p.hour)}:00 (${p.price})`);

    this.platform.log.info(
      `[${this.deviceConfig.name}] Schedule ` +
      `(${windowStartDate} ${this.padHour(rangeStart)}:00-${windowEndDate} ${this.padHour(rangeEnd)}:00) ` +
      `-> ON: [${onHours.join(', ')}] | OFF: [${offHours.join(', ')}]`,
    );
  }

  private logStoredOvernightSchedule(schedule: OvernightSchedule): void {
    const onHours = schedule.allHours
      .filter(h => h.selected)
      .map(h => `${h.hourKey} (${h.price})`);

    const offHours = schedule.allHours
      .filter(h => !h.selected)
      .map(h => `${h.hourKey} (${h.price})`);

    this.platform.log.info(
      `[${this.deviceConfig.name}] Overnight schedule (${schedule.windowStart} -> ${schedule.windowEnd}) ` +
      `-> ON: [${onHours.join(', ')}] | OFF: [${offHours.join(', ')}]`,
    );
  }

  private sortChronologically(hours: PricePointWithDate[]): PricePointWithDate[] {
    return [...hours].sort((a, b) => {
      if (a.dateKey === b.dateKey) {
        return a.hour - b.hour;
      }

      return a.dateKey.localeCompare(b.dateKey);
    });
  }

  private withDateKey(prices: PricePoint[], dateKey: string): PricePointWithDate[] {
    return prices.map(p => ({
      ...p,
      dateKey,
    }));
  }

  private priceHourKey(price: PricePointWithDate): string {
    return `${price.dateKey} ${this.padHour(price.hour)}:00`;
  }

  private hourKey(dateTime: DateTime): string {
    return `${dateTime.toFormat('yyyy-MM-dd')} ${dateTime.toFormat('HH')}:00`;
  }

  private overnightScheduleCacheKey(todayKey: string): string {
    const { name, rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;
    return `overnight-schedule:${name}:${todayKey}:${rangeStart}-${rangeEnd}:${cheapestHours}`;
  }

  private expectedWindowHourCount(rangeStart: number, rangeEnd: number): number {
    // Current plugin semantics are inclusive:
    // 23-7 means 23:00 plus 00:00, 01:00, ..., 07:00 = 9 hours.
    if (rangeStart <= rangeEnd) {
      return rangeEnd - rangeStart + 1;
    }

    return (24 - rangeStart) + (rangeEnd + 1);
  }

  private normaliseDeviceConfig(config: DeviceConfig): DeviceConfig {
    return {
      ...config,
      cheapestHours: this.normaliseNumber(config.cheapestHours, 3),
      rangeStart: this.normaliseHour(config.rangeStart, 0),
      rangeEnd: this.normaliseHour(config.rangeEnd, 23),
    };
  }

  private normaliseHour(value: number | string, fallback: number): number {
    const parsed = this.normaliseNumber(value, fallback);

    if (parsed < 0) {
      return 0;
    }

    if (parsed > 23) {
      return 23;
    }

    return parsed;
  }

  private normaliseNumber(value: number | string, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value);
    }

    if (typeof value === 'string') {
      const match = value.match(/\d+/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return fallback;
  }

  private padHour(hour: number): string {
    return hour.toString().padStart(2, '0');
  }
}
