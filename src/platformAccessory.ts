import { PlatformAccessory, API, Logging, Service } from 'homebridge';
import { DateTime } from 'luxon';
import { schedule } from 'node-cron';

import { NordpoolPlatform } from './platform';
import {
  fnc_todayKey,
  fnc_tomorrowKey,
  defaultPricesCache,
  defaultAreaTimezone,
} from './settings';

// Load Fakegato-history for Eve app support
const FakeGatoHistoryService = require('fakegato-history');

type DeviceConfig = {
  name: string;
  cheapestHours: number | string;
  rangeStart: number | string;
  rangeEnd: number | string;
};

type NormalizedDeviceConfig = {
  name: string;
  cheapestHours: number;
  rangeStart: number;
  rangeEnd: number;
};

type PricePoint = {
  day: number;
  hour: number;
  price: number;
};

type PricePointWithDate = PricePoint & {
  dateKey: string;
};

type OvernightScheduleHour = {
  hourKey: string;
  price: number;
  selected: boolean;
};

type OvernightSchedule = {
  windowStartDate: string;
  windowEndDate: string;
  windowStartHour: number;
  windowEndHour: number;
  selectedHours: string[];
  allHours: OvernightScheduleHour[];
  createdAt: string;
};

export class NordpoolPlatformAccessory {
  private service: Service;
  private historyService: any;
  private pricesCache = defaultPricesCache(this.api, this.platform.log as Logging);
  private deviceConfig: NormalizedDeviceConfig;

  constructor(
    private readonly platform: NordpoolPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: API,
  ) {
    this.deviceConfig = this.normalizeDeviceConfig(accessory.context.device);
    this.accessory.context.device = this.deviceConfig;

    this.platform.log.debug(
      `[${this.deviceConfig.name}] Loaded device config: ${JSON.stringify(this.deviceConfig)}`,
    );

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Nordpool')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dynamic Price Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Use Contact Sensor type in HomeKit
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Fakegato requires the 'door' type for Contact Sensors.
    // Route Fakegato's noisy normal logs to debug level, while keeping real errors visible.
    const fakegatoLogger = {
      info: this.platform.log.debug.bind(this.platform.log),
      warn: this.platform.log.debug.bind(this.platform.log),
      error: this.platform.log.error.bind(this.platform.log),
      debug: this.platform.log.debug.bind(this.platform.log),
    };

    const FakeGatoHistory = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoHistory('door', this.accessory, {
      log: fakegatoLogger,
      storage: 'fs',
      path: this.api.user.storagePath() + '/accessories',
      filename: `history_${this.accessory.UUID}.json`,
    });

    // Do not call updateStatus() here.
    // platform.ts runs the initial update once after prices are fetched and devices are discovered.

    // Cron expression: runs exactly at the start of every hour (XX:00:00)
    schedule('0 * * * *', () => {
      // Add a 7-second delay to allow prices to update and HomeKit to catch up
      setTimeout(() => {
        this.platform.log.debug(`[${this.deviceConfig.name}] Hourly update triggered with 7s offset.`);
        this.updateStatus();
      }, 7000);
    });
  }

  async updateStatus() {
    const todayKey = fnc_todayKey(this.platform.config);
    const tomorrowKey = fnc_tomorrowKey(this.platform.config);

    const cachedToday: PricePoint[] = await this.pricesCache.get(todayKey) || [];
    const cachedTomorrow: PricePoint[] = await this.pricesCache.get(tomorrowKey) || [];

    const todayPrices = this.withDateKey(cachedToday, todayKey);
    const tomorrowPrices = this.withDateKey(cachedTomorrow, tomorrowKey);

    const allPrices = [...todayPrices, ...tomorrowPrices];

    if (allPrices.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      this.setHomeKitAndHistoryState(false);
      return;
    }

    const isCurrentlyOn = await this.calculateCheapestStatus(allPrices, todayKey, tomorrowKey);

    this.setHomeKitAndHistoryState(isCurrentlyOn);
  }

  async calculateCheapestStatus(
    allPrices: PricePointWithDate[],
    todayKey: string,
    tomorrowKey: string,
  ): Promise<boolean> {
    const timezone = defaultAreaTimezone(this.platform.config);
    const now = DateTime.local().setZone(timezone).startOf('hour');

    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    this.platform.log.debug(
      `[${this.deviceConfig.name}] Calculating with rangeStart=${rangeStart}, ` +
      `rangeEnd=${rangeEnd}, cheapestHours=${cheapestHours}`,
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
        `[${this.deviceConfig.name}] No price data for range ` +
        `${todayKey} ${this.padHour(rangeStart)}:00-${this.padHour(rangeEnd)}:00.`,
      );
      return false;
    }

    const cheapestHoursArray = this.selectCheapestHours(targetHours, cheapestHours);

    this.logCalculatedSchedule(
      targetHours,
      cheapestHoursArray,
      todayKey,
      todayKey,
    );

    const currentHourKey = this.dateTimeHourKey(now);

    return cheapestHoursArray.some(p => this.priceHourKey(p) === currentHourKey);
  }

  private async calculateOvernightStatus(
    allPrices: PricePointWithDate[],
    todayKey: string,
    tomorrowKey: string,
    now: DateTime,
  ): Promise<boolean> {
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    const currentHour = now.hour;
    const yesterdayKey = now.minus({ day: 1 }).toFormat('yyyy-MM-dd');

    /*
     * Overnight behavior:
     *
     * 1. If current time is after midnight and still inside the overnight window
     *    e.g. range 23-07 and now is 01:00:
     *    - use yesterday's precomputed schedule
     *    - if it does not exist, remain OFF
     *
     * 2. If current time is before the evening start
     *    e.g. range 23-07 and now is 17:00:
     *    - create today's upcoming overnight schedule only if tomorrow prices exist
     *    - current state remains OFF because we are outside the active window
     *
     * 3. If current time is at/after rangeStart
     *    e.g. range 23-07 and now is 23:00:
     *    - use or create today's overnight schedule
     */

    const isMorningPartOfActiveOvernight = currentHour <= rangeEnd;
    const isEveningPartOfActiveOvernight = currentHour >= rangeStart;

    if (isMorningPartOfActiveOvernight) {
      const activeScheduleKey = this.overnightScheduleCacheKey(yesterdayKey);
      const activeSchedule: OvernightSchedule | undefined = await this.pricesCache.get(activeScheduleKey);

      if (!activeSchedule) {
        this.platform.log.warn(
          `[${this.deviceConfig.name}] No precomputed overnight schedule for active window ` +
          `${yesterdayKey} ${this.padHour(rangeStart)}:00 -> ${todayKey} ${this.padHour(rangeEnd)}:00. ` +
          'Device remains OFF.',
        );
        return false;
      }

      this.logStoredOvernightSchedule(activeSchedule);

      const currentHourKey = this.dateTimeHourKey(now);
      return activeSchedule.selectedHours.includes(currentHourKey);
    }

    const upcomingScheduleKey = this.overnightScheduleCacheKey(todayKey);
    let upcomingSchedule: OvernightSchedule | undefined = await this.pricesCache.get(upcomingScheduleKey);

    if (!upcomingSchedule) {
      const targetHours = allPrices.filter(p =>
        (p.dateKey === todayKey && p.hour >= rangeStart) ||
        (p.dateKey === tomorrowKey && p.hour <= rangeEnd),
      );

      const expectedHours = this.expectedWindowHourCount(rangeStart, rangeEnd);

      if (targetHours.length < expectedHours) {
        this.platform.log.warn(
          `[${this.deviceConfig.name}] Overnight schedule not created yet. ` +
          `Need ${expectedHours} hours for ${todayKey} ${this.padHour(rangeStart)}:00 -> ` +
          `${tomorrowKey} ${this.padHour(rangeEnd)}:00, but only ${targetHours.length} hours are available. ` +
          'Device remains OFF.',
        );
        return false;
      }

      const cheapestHoursArray = this.selectCheapestHours(targetHours, cheapestHours);

      upcomingSchedule = {
        windowStartDate: todayKey,
        windowEndDate: tomorrowKey,
        windowStartHour: rangeStart,
        windowEndHour: rangeEnd,
        selectedHours: cheapestHoursArray.map(p => this.priceHourKey(p)),
        allHours: this.sortChronologically(targetHours).map(p => ({
          hourKey: this.priceHourKey(p),
          price: p.price,
          selected: cheapestHoursArray.includes(p),
        })),
        createdAt: now.toISO() || new Date().toISOString(),
      };

      await this.pricesCache.set(upcomingScheduleKey, upcomingSchedule);

      this.platform.log.info(
        `[${this.deviceConfig.name}] Created overnight schedule ` +
        `${todayKey} ${this.padHour(rangeStart)}:00 -> ${tomorrowKey} ${this.padHour(rangeEnd)}:00.`,
      );
    }

    this.logStoredOvernightSchedule(upcomingSchedule);

    if (!isEveningPartOfActiveOvernight) {
      return false;
    }

    const currentHourKey = this.dateTimeHourKey(now);
    return upcomingSchedule.selectedHours.includes(currentHourKey);
  }

  private setHomeKitAndHistoryState(isCurrentlyOn: boolean): void {
    /*
     * DOUBLE PULSE STRATEGY FOR HOMEKIT AUTOMATIONS
     *
     * To ensure HomeKit automations trigger reliably even if they are created
     * during an already active long period, pulse the state briefly to the
     * opposite value, then set the true value.
     */

    if (isCurrentlyOn) {
      // Electricity is CHEAP.
      // Pulse strategy: Force to OFF, then back to ON after 1 second.
      this.service.updateCharacteristic(
        this.platform.Characteristic.ContactSensorState,
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
      );

      setTimeout(() => {
        this.service.updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
        );
      }, 1000);
    } else {
      // Electricity is EXPENSIVE.
      // Pulse strategy: Force to ON, then back to OFF after 1 second.
      this.service.updateCharacteristic(
        this.platform.Characteristic.ContactSensorState,
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
      );

      setTimeout(() => {
        this.service.updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }, 1000);
    }

    // Record the TRUE state to Fakegato History.
    // The 'door' type expects the 'status' key:
    // 1 = open/cheap, 0 = closed/expensive.
    this.historyService.addEntry({
      time: Math.round(new Date().getTime() / 1000),
      status: isCurrentlyOn ? 1 : 0,
    });

    this.platform.log.info(
      `[${this.deviceConfig.name}] Status update: ` +
      `${isCurrentlyOn ? 'ON (Cheap)' : 'OFF (Expensive)'} ` +
      '(Pulsed to ensure automation trigger)',
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

  private logCalculatedSchedule(
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

    this.platform.log.debug(
      `[${this.deviceConfig.name}] Schedule ` +
      `(${windowStartDate} ${this.padHour(rangeStart)}:00 -> ` +
      `${windowEndDate} ${this.padHour(rangeEnd)}:00) ` +
      `ON: [${onHours.join(', ')}] | OFF: [${offHours.join(', ')}]`,
    );
  }

  private logStoredOvernightSchedule(schedule: OvernightSchedule): void {
    const onHours = schedule.allHours
      .filter(h => h.selected)
      .map(h => `${h.hourKey} (${h.price})`);

    const offHours = schedule.allHours
      .filter(h => !h.selected)
      .map(h => `${h.hourKey} (${h.price})`);

    this.platform.log.debug(
      `[${this.deviceConfig.name}] Overnight schedule ` +
      `(${schedule.windowStartDate} ${this.padHour(schedule.windowStartHour)}:00 -> ` +
      `${schedule.windowEndDate} ${this.padHour(schedule.windowEndHour)}:00) ` +
      `ON: [${onHours.join(', ')}] | OFF: [${offHours.join(', ')}]`,
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

  private dateTimeHourKey(dateTime: DateTime): string {
    return `${dateTime.toFormat('yyyy-MM-dd')} ${dateTime.toFormat('HH')}:00`;
  }

  private overnightScheduleCacheKey(windowStartDate: string): string {
    const { name, rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    return `overnight-schedule:${name}:${windowStartDate}:${rangeStart}-${rangeEnd}:${cheapestHours}`;
  }

  private expectedWindowHourCount(rangeStart: number, rangeEnd: number): number {
    /*
     * Current plugin semantics are inclusive.
     *
     * Example:
     * 23-7 means:
     * 23:00,
     * 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00, 07:00
     * = 9 hours.
     */
    if (rangeStart <= rangeEnd) {
      return rangeEnd - rangeStart + 1;
    }

    return (24 - rangeStart) + (rangeEnd + 1);
  }

  private normalizeDeviceConfig(config: DeviceConfig): NormalizedDeviceConfig {
    return {
      name: config.name,
      cheapestHours: this.normalizeNumber(config.cheapestHours, 3),
      rangeStart: this.normalizeHour(config.rangeStart, 0),
      rangeEnd: this.normalizeHour(config.rangeEnd, 23),
    };
  }

  private normalizeHour(value: number | string, fallback: number): number {
    const parsed = this.normalizeNumber(value, fallback);

    if (parsed < 0) {
      return 0;
    }

    if (parsed > 23) {
      return 23;
    }

    return parsed;
  }

  private normalizeNumber(value: number | string, fallback: number): number {
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