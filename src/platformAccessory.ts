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
    // Retrieve device-specific configuration from context
    this.deviceConfig = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Nordpool')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dynamic Price Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Use Contact Sensor type for HomeKit compatibility and clear Eve history bars
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Initialize Fakegato history service specifically for 'contact' type
    const FakeGatoHistory = FakeGatoHistoryService(this.api);
    this.historyService = new FakeGatoHistory('contact', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      path: this.api.user.storagePath() + '/accessories',
      filename: `history_${this.accessory.UUID}.json`,
    });

    // Run initial status check
    this.updateStatus();

    // Schedule updates at the start of every hour
    schedule('0 * * * *', () => {
      this.platform.log.info(`[${this.deviceConfig.name}] Hourly update triggered.`);
      this.updateStatus();
    });
  }

  async updateStatus() {
    const todayKey = fnc_todayKey(this.platform.config);
    const tomorrowKey = fnc_tomorrowKey(this.platform.config);

    // Fetch prices from cache for the calculation window
    const cachedToday = await this.pricesCache.get(todayKey) || [];
    const cachedTomorrow = await this.pricesCache.get(tomorrowKey) || [];
    const allPrices = [...cachedToday, ...cachedTomorrow];

    if (allPrices.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      return;
    }

    const isCurrentlyOn = this.calculateCheapestStatus(allPrices);

    // HomeKit mapping: 0 = DETECTED (Closed/Expensive), 1 = NOT_DETECTED (Open/Cheap)
    const characteristic = this.platform.Characteristic.ContactSensorState;
    const value = isCurrentlyOn
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.service.updateCharacteristic(characteristic, value);

    // Update Eve history: Use 'contact' field for contact sensors (1 = Open, 0 = Closed)
    this.historyService.addEntry({
      time: Math.round(new Date().getTime() / 1000),
      contact: isCurrentlyOn ? 1 : 0,
    });

    this.platform.log.info(`[${this.deviceConfig.name}] Status update: ${isCurrentlyOn ? 'ON (Cheap)' : 'OFF (Expensive)'}`);
  }

  calculateCheapestStatus(allPrices: any[]): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    let targetHours: any[] = [];

    // Define the time window for searching cheap hours
    if (rangeStart <= rangeEnd) {
      // Linear range within the same day
      targetHours = allPrices.filter(p => p.day === currentDay && p.hour >= rangeStart && p.hour <= rangeEnd);
    } else {
      // Overnight range spanning across two days
      targetHours = allPrices.filter(p => {
        const isTonight = p.day === currentDay && p.hour >= rangeStart;
        const isTomorrowMorning = p.day !== currentDay && p.hour <= rangeEnd;
        return isTonight || isTomorrowMorning;
      });
    }

    if (targetHours.length === 0) {
      return false;
    }

    // Sort by price and select the cheapest requested hours
    const sortedWindow = [...targetHours].sort((a, b) => a.price - b.price);
    const cheapestHoursArray = sortedWindow.slice(0, Math.min(cheapestHours, targetHours.length));

    this.platform.log.debug(`[${this.deviceConfig.name}] Window size: ${targetHours.length}h, Target cheapest: ${cheapestHours}h`);
    
    // Check if current hour is among the selected cheapest hours
    return cheapestHoursArray.some(p => p.hour === currentHour && p.day === currentDay);
  }
}
