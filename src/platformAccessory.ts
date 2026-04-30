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
      filename: `history_${this.accessory.UUID}.json`,
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
    const tomorrowKey = fnc_tomorrowKey(this.platform.config);

    // Fetch prices for today and tomorrow to handle overnight ranges
    const cachedToday = await this.pricesCache.get(todayKey) || [];
    const cachedTomorrow = await this.pricesCache.get(tomorrowKey) || [];

    // Combine price data
    const allPrices = [...cachedToday, ...cachedTomorrow];

    if (allPrices.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      return;
    }

    const isCurrentlyOn = this.calculateCheapestStatus(allPrices);

    // HomeKit ContactSensor: 0 = DETECTED (Expensive), 1 = NOT_DETECTED (Cheap/On)
    const characteristic = this.platform.Characteristic.ContactSensorState;
    const value = isCurrentlyOn
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.service.updateCharacteristic(characteristic, value);

    // Log the state change to Fakegato history (1 = Open/Cheap, 0 = Closed/Expensive)
    this.historyService.addEntry({
      time: Math.round(new Date().valueOf() / 1000),
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

    // 1. Filter hours based on the defined time window
    if (rangeStart <= rangeEnd) {
      // Normal time window (e.g., 08-16) - focus on today only
      targetHours = allPrices.filter(p => p.day === currentDay && p.hour >= rangeStart && p.hour <= rangeEnd);
    } else {
      // Overnight time window (e.g., 22-06) - compare tonight with tomorrow morning
      targetHours = allPrices.filter(p => {
        const isTonight = p.day === currentDay && p.hour >= rangeStart;
        const isTomorrowMorning = p.day !== currentDay && p.hour <= rangeEnd;
        return isTonight || isTomorrowMorning;
      });
    }

    if (targetHours.length === 0) {
      return false;
    }

    // 2. Sort the relevant window by price (cheapest first)
    const sortedWindow = [...targetHours].sort((a, b) => a.price - b.price);

    // 3. Pick the top X cheapest hours from the target window
    const cheapestHoursArray = sortedWindow.slice(0, Math.min(cheapestHours, targetHours.length));

    // Debug logging for troubleshooting
    this.platform.log.debug(`[${this.deviceConfig.name}] Window size: ${targetHours.length}h, Target cheapest: ${cheapestHours}h`);
    this.platform.log.debug(`[${this.deviceConfig.name}] Cheapest hours in current/next window: ${cheapestHoursArray.map(p => p.hour).join(',')}`);

    // 4. Check if the current hour (and day) is among the selected cheapest hours
    return cheapestHoursArray.some(p => p.hour === currentHour && p.day === currentDay);
  }
}