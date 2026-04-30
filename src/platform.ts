import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Logging } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, defaultPricesCache, fnc_todayKey, fnc_tomorrowKey } from './settings';
import { NordpoolPlatformAccessory } from './platformAccessory';
import { Functions } from './functions';
import { schedule } from 'node-cron';

export class NordpoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly pricesCache = defaultPricesCache(this.api, this.log as Logging);
  private readonly fnc = new Functions(this, this.api);

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');

      // 1. Fetch prices immediately upon startup
      await this.updatePrices();

      // 2. Initialize devices
      this.discoverDevices();

      // 3. Set up automatic update every hour (e.g., at minute 1)
      // This ensures new tomorrow prices are fetched after 14:00-15:00 release
      schedule('1 * * * *', async () => {
        await this.updatePrices();
      });
    });
  }

  /**
   * Centralized function to fetch prices and store them in cache
   */
  async updatePrices() {
    this.log.info('Refreshing Nordpool prices...');

    try {
      const rawData = await this.fnc.pullNordpoolData();
      if (!rawData || rawData.length === 0) {
        this.log.warn('Failed to fetch prices from API.');
        return;
      }

      // Handle solar panel price overrides
      const processedData = await this.fnc.applySolarOverride(rawData);

      // Get date keys as strings (e.g., "2026-04-30")
      const todayKey = fnc_todayKey(this.config);
      const tomorrowKey = fnc_tomorrowKey(this.config);

      // Extract numeric day of month from the keys to match NordpoolData.day (number)
      const todayDayNum = parseInt(todayKey.split('-').pop() || '0');
      const tomorrowDayNum = parseInt(tomorrowKey.split('-').pop() || '0');

      // Filter data for today and tomorrow using the day numbers
      const todayPrices = processedData.filter(p => p.day === todayDayNum);
      const tomorrowPrices = processedData.filter(p => p.day === tomorrowDayNum);

      // Check and fix missing hours (e.g., daylight saving time transitions)
      const finalToday = this.fnc.fillMissingHours(todayPrices, todayKey);

      if (finalToday.length > 0) {
        await this.pricesCache.set(todayKey, finalToday);
        this.log.info(`Prices updated for today (${todayKey}). Count: ${finalToday.length}`);
      }

      if (tomorrowPrices.length > 0) {
        const finalTomorrow = this.fnc.fillMissingHours(tomorrowPrices, tomorrowKey);
        await this.pricesCache.set(tomorrowKey, finalTomorrow);
        this.log.info(`Prices updated for tomorrow (${tomorrowKey}). Count: ${finalTomorrow.length}`);
      }

    } catch (error) {
      this.log.error('Error during price update:', error);
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    if (!this.config.devices || !Array.isArray(this.config.devices)) {
      this.log.warn('No devices found in configuration.');
      return;
    }

    const processedUUIDs: string[] = [];

    for (const device of this.config.devices) {
      const uuid = this.api.hap.uuid.generate(device.name);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', device.name);
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);
        new NordpoolPlatformAccessory(this, existingAccessory, this.api);
      } else {
        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);
        accessory.context.device = device;
        new NordpoolPlatformAccessory(this, accessory, this.api);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      processedUUIDs.push(uuid);
    }

    // Remove obsolete accessories
    for (const [uuid, accessory] of this.accessories) {
      if (!processedUUIDs.includes(uuid)) {
        this.log.info('Removing accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}