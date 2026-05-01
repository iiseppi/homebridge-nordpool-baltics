import { PlatformAccessory, API, Logging, Service } from 'homebridge';
import { NordpoolPlatform } from './platform';
import { fnc_todayKey, fnc_tomorrowKey, defaultPricesCache } from './settings';
import { schedule } from 'node-cron';

// Load Fakegato-history for Eve app support
const FakeGatoHistoryService = require('fakegato-history');

export class NordpoolPlatformAccessory {
  private service: Service;
  private historyService: any;
  private pricesCache = defaultPricesCache(this.api, this.platform.log as Logging);
  private deviceConfig: { name: string, cheapestHours: number, rangeStart: number, rangeEnd: number };

  constructor(
    private readonly platform: NordpoolPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: API,
  ) {
    this.deviceConfig = accessory.context.device;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
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

  async updateStatus() {
    const todayKey = fnc_todayKey(this.platform.config);
    const tomorrowKey = fnc_tomorrowKey(this.platform.config);

    const cachedToday = await this.pricesCache.get(todayKey) || [];
    const cachedTomorrow = await this.pricesCache.get(tomorrowKey) || [];
    const allPrices = [...cachedToday, ...cachedTomorrow];

    if (allPrices.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      return;
    }

    const isCurrentlyOn = this.calculateCheapestStatus(allPrices);

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

    this.platform.log.info(`[${this.deviceConfig.name}] Status update: ${isCurrentlyOn ? 'ON (Cheap)' : 'OFF (Expensive)'}`);
  }

  calculateCheapestStatus(allPrices: any[]): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    let targetHours: any[] = [];

    if (rangeStart <= rangeEnd) {
      targetHours = allPrices.filter(p => p.day === currentDay && p.hour >= rangeStart && p.hour <= rangeEnd);
    } else {
      targetHours = allPrices.filter(p => {
        const isTonight = p.day === currentDay && p.hour >= rangeStart;
        const isTomorrowMorning = p.day !== currentDay && p.hour <= rangeEnd;
        return isTonight || isTomorrowMorning;
      });
    }

    if (targetHours.length === 0) {
      return false;
    }

    const sortedWindow = [...targetHours].sort((a, b) => a.price - b.price);
    const cheapestHoursArray = sortedWindow.slice(0, Math.min(cheapestHours, targetHours.length));

    // LOGGING: Format hours with their exact prices for full transparency
    const onHours = cheapestHoursArray
      .sort((a, b) => a.hour - b.hour)
      .map(p => `${p.hour}:00 (${p.price})`);

    const offHours = targetHours
      .filter(p => !cheapestHoursArray.includes(p))
      .sort((a, b) => a.hour - b.hour)
      .map(p => `${p.hour}:00 (${p.price})`);

    // Print a clear summary to the log including prices
    this.platform.log.info(`[${this.deviceConfig.name}] Schedule (${rangeStart}:00-${rangeEnd}:00) -> ON: [${onHours.join(', ')}] | OFF: [${offHours.join(', ')}]`);

    return cheapestHoursArray.some(p => p.hour === currentHour && p.day === currentDay);
  }
}
