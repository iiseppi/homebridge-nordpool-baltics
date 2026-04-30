import { PlatformAccessory, API, Logging, Service, CharacteristicValue } from 'homebridge';
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
    // Retrieve device-specific configuration from context
    this.deviceConfig = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Nordpool')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dynamic Price Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Use Contact Sensor type for HomeKit compatibility
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Initialize Fakegato history service for the Contact Sensor
    const FakeGatoHistory = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoHistory('contact', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: this.api.user.storagePath() + '/accessories',
      filename: `history_${this.accessory.UUID}.json`
    });

    // Initial status check
    this.updateStatus();

    // Schedule hourly updates
    schedule('0 * * * *', () => {
      this.platform.log.info(`[${this.deviceConfig.name}] Hourly update triggered.`);
      this.updateStatus();
    });
  }

  async updateStatus() {
    const todayKey = fnc_todayKey(this.platform.config);
    const cachedToday = await this.pricesCache.get(todayKey);

    if (!Array.isArray(cachedToday) || cachedToday.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      return;
    }

    const isCurrentlyOn = this.calculateCheapestStatus(cachedToday);

    // HomeKit ContactSensor: 0 = DETECTED (Off/Expensive), 1 = NOT_DETECTED (On/Cheap)
    const characteristic = this.platform.Characteristic.ContactSensorState;
    const value = isCurrentlyOn
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.service.updateCharacteristic(characteristic, value);

    // Log the state change to Fakegato history (1 = Open/Cheap, 0 = Closed/Expensive)
    const historyStatus = isCurrentlyOn ? 1 : 0;
    this.historyService.addEntry({
      time: Math.round(new Date().valueOf() / 1000), // Current Unix timestamp
      status: historyStatus
    });

    // Updated log message to be clearer
    this.platform.log.info(`[${this.deviceConfig.name}] Status update: ${isCurrentlyOn ? 'ON (Cheap)' : 'OFF (Expensive)'}`);
  }

  calculateCheapestStatus(prices: any[]): boolean {
    const currentHour = new Date().getHours();
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    // 1. Filter hours based on the defined time window
    const windowPrices = prices.filter(p => {
      if (rangeStart <= rangeEnd) {
        // Normal time window (e.g., 08-16)
        return p.hour >= rangeStart && p.hour <= rangeEnd;
      } else {
        // Overnight time window (e.g., 23-06)
        return p.hour >= rangeStart || p.hour <= rangeEnd;
      }
    });

    if (windowPrices.length === 0) {
      return false;
    }

    // 2. Sort by price (cheapest first)
    const sortedWindow = [...windowPrices].sort((a, b) => a.price - b.price);

    // 3. Pick the top X cheapest hours
    const cheapestHoursArray = sortedWindow
      .slice(0, Math.min(cheapestHours, windowPrices.length))
      .map(p => p.hour);

    // Debug logging
    this.platform.log.debug(`[${this.deviceConfig.name}] Time window hours: ${windowPrices.map(p => p.hour).join(',')}`);
    this.platform.log.debug(`[${this.deviceConfig.name}] Cheapest hours in window: ${cheapestHoursArray.join(',')}`);

    // 4. Check if the current hour is among the selected cheapest hours
    return cheapestHoursArray.includes(currentHour);
  }
}