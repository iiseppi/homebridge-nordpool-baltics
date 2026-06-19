import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  defaultPricesCache,
  fnc_todayKey,
  fnc_tomorrowKey,
} from './settings';

import { NordpoolPlatformAccessory } from './platformAccessory';
import { Functions } from './functions';
import { schedule } from 'node-cron';

export class NordpoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: Map<string, PlatformAccessory> = new Map();

  private pricesCache;
  private fnc: Functions;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.pricesCache = defaultPricesCache(this.api, this.log);
    this.fnc = new Functions(this, this.api);

    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');

      // 1. Fetch prices immediately upon startup
      await this.updatePrices();

      // 2. Initialize devices
      this.discoverDevices();

      // 3. Set up automatic update every hour at minute 1
      // This ensures new tomorrow prices are fetched after price release.
      schedule('1 * * * *', async () => {
        await this.updatePrices();
      });
    });
  }

  /**
   * Centralized function to fetch prices and store them in cache.
   */
  async updatePrices(): Promise<void> {
    this.log.info('Refreshing Nordpool prices...');

    try {
      const rawData = await this.fnc.pullNordpoolData();

      if (!rawData || rawData.length === 0) {
        this.log.warn('Failed to fetch prices from API.');
        return;
      }

      // Handle solar panel price overrides
      const processedData = await this.fnc.applySolarOverride(rawData);

      // Get date keys as strings, e.g. "2026-04-30"
      const todayKey = fnc_todayKey(this.config);
      const tomorrowKey = fnc_tomorrowKey(this.config);

      // Extract numeric day of month from the keys to match NordpoolData.day.
      // This is how the current plugin stores provider data.
      const todayDayNum = parseInt(todayKey.split('-').pop() || '0', 10);
      const tomorrowDayNum = parseInt(tomorrowKey.split('-').pop() || '0', 10);

      const todayPrices = processedData.filter(p => p.day === todayDayNum);
      const tomorrowPrices = processedData.filter(p => p.day === tomorrowDayNum);

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

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices(): void {
    if (!this.config.devices || !Array.isArray(this.config.devices)) {
      this.log.warn('No devices found in configuration.');
      return;
    }

    const processedUUIDs: string[] = [];

    for (const device of this.config.devices) {
      this.log.info(`Configured device: ${JSON.stringify(device)}`);

      const uuid = this.api.hap.uuid.generate(device.name);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', device.name);

        // Important: always refresh cached accessory context from current config.
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        new NordpoolPlatformAccessory(this, existingAccessory, this.api);
      } else {
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);

        // Important: store current config before constructing the accessory handler.
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
