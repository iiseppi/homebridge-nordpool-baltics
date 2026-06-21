import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
  Logging,
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

type PriceHour = {
  hour: number;
};

export class NordpoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: Map<string, PlatformAccessory> = new Map();

  private readonly pricesCache = defaultPricesCache(this.api, this.log as Logging);
  private readonly fnc = new Functions(this, this.api);

  // Store references to accessory instances to trigger updates manually.
  private readonly activeAccessories: NordpoolPlatformAccessory[] = [];

  private lastCompleteTomorrowKey?: string;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');

      // 1. Fetch prices immediately upon startup.
      await this.updatePrices();

      // 2. Initialize devices.
      this.discoverDevices();

      // 3. Force initial state update for all discovered devices.
      // This ensures HomeKit gets the correct state immediately after boot.
      await this.updateActiveAccessoryStatuses();

      // 4. Set up automatic price fetching from the API.
      // We run this at 2 minutes past the hour to avoid hitting the API
      // exactly on the hour when servers are busiest.
      schedule('2 * * * *', async () => {
        await this.refreshPricesAndAccessories();
      });

      // 5. During the common next-day price publication window, retry more often
      // until a complete tomorrow cache has been created. This ensures overnight
      // schedules are created soon after next-day prices become available instead
      // of waiting until the next hourly refresh.
      schedule('*/5 13-22 * * *', async () => {
        if (!this.needsTomorrowPriceRefresh()) {
          return;
        }

        this.log.debug('Extra tomorrow price refresh triggered.');
        await this.refreshPricesAndAccessories();
      });
    });
  }

  /**
   * Centralized function to fetch prices from the API and store them in the local cache.
   */
  async updatePrices() {
    this.log.info('Refreshing Nordpool prices...');

    try {
      const rawData = await this.fnc.pullNordpoolData();

      if (!rawData || rawData.length === 0) {
        this.log.warn('Failed to fetch prices from API.');
        return;
      }

      // Handle solar panel price overrides.
      const processedData = await this.fnc.applySolarOverride(rawData);

      // Get date keys as strings, e.g. "2026-04-30".
      const todayKey = fnc_todayKey(this.config);
      const tomorrowKey = fnc_tomorrowKey(this.config);

      // Extract numeric day of month from the keys to match NordpoolData.day.
      const todayDayNum = parseInt(todayKey.split('-').pop() || '0', 10);
      const tomorrowDayNum = parseInt(tomorrowKey.split('-').pop() || '0', 10);

      // Filter data for today and tomorrow using the day numbers.
      const todayPrices = processedData.filter(p => p.day === todayDayNum);
      const tomorrowPrices = processedData.filter(p => p.day === tomorrowDayNum);

      // Check and fix missing hours, e.g. daylight saving time transitions.
      const finalToday = this.fnc.fillMissingHours(todayPrices, todayKey);

      if (finalToday.length > 0) {
        await this.pricesCache.set(todayKey, finalToday);
        this.log.info(
          `Prices updated for today (${todayKey}). Count: ${finalToday.length}. ` +
          `Hours: ${this.formatPriceHours(finalToday)}`,
        );
      }

      if (tomorrowPrices.length > 0) {
        const finalTomorrow = this.fnc.fillMissingHours(tomorrowPrices, tomorrowKey);

        if (this.isTomorrowPriceDataUsableForConfiguredDevices(finalTomorrow)) {
          await this.pricesCache.set(tomorrowKey, finalTomorrow);
          this.lastCompleteTomorrowKey = tomorrowKey;
          this.log.info(
            `Prices updated for tomorrow (${tomorrowKey}). Count: ${finalTomorrow.length}. ` +
            `Hours: ${this.formatPriceHours(finalTomorrow)}`,
          );
        } else {
          const cachedTomorrow: PriceHour[] = await this.pricesCache.get(tomorrowKey) || [];

          if (this.isTomorrowPriceDataUsableForConfiguredDevices(cachedTomorrow)) {
            this.lastCompleteTomorrowKey = tomorrowKey;
            this.log.info(
              `Fetched tomorrow prices for ${tomorrowKey} are incomplete. ` +
              `Fetched Count: ${finalTomorrow.length}. Hours: ${this.formatPriceHours(finalTomorrow)}. ` +
              `Keeping existing cached tomorrow prices. Cached Count: ${cachedTomorrow.length}.`,
            );
          } else {
            this.log.info(
              `Fetched tomorrow prices for ${tomorrowKey} are incomplete. ` +
              `Fetched Count: ${finalTomorrow.length}. Hours: ${this.formatPriceHours(finalTomorrow)}. ` +
              'Not updating tomorrow cache yet.',
            );
          }
        }
      } else {
        this.log.debug(`No tomorrow prices available yet for ${tomorrowKey}.`);
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

    this.activeAccessories.length = 0;

    const processedUUIDs: string[] = [];

    for (const device of this.config.devices) {
      const uuid = this.api.hap.uuid.generate(device.name);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', device.name);

        // Always refresh cached accessory context from current config.
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        const accInstance = new NordpoolPlatformAccessory(this, existingAccessory, this.api);
        this.activeAccessories.push(accInstance);
      } else {
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);

        // Store current config before constructing the accessory handler.
        accessory.context.device = device;

        const accInstance = new NordpoolPlatformAccessory(this, accessory, this.api);
        this.activeAccessories.push(accInstance);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      processedUUIDs.push(uuid);
    }

    // Remove obsolete accessories that are no longer in the configuration.
    for (const [uuid, accessory] of this.accessories) {
      if (!processedUUIDs.includes(uuid)) {
        this.log.info('Removing accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  private async refreshPricesAndAccessories(): Promise<void> {
    await this.updatePrices();
    await this.updateActiveAccessoryStatuses();
  }

  private async updateActiveAccessoryStatuses(): Promise<void> {
    for (const accessory of this.activeAccessories) {
      await accessory.updateStatus();
    }
  }

  private needsTomorrowPriceRefresh(): boolean {
    return this.hasOvernightDevices() && this.lastCompleteTomorrowKey !== fnc_tomorrowKey(this.config);
  }

  private isTomorrowPriceDataUsableForConfiguredDevices(prices: PriceHour[]): boolean {
    if (!this.hasOvernightDevices()) {
      return prices.length > 0;
    }

    const maxRequiredTomorrowHour = this.getMaxRequiredTomorrowHourForOvernightDevices();

    if (maxRequiredTomorrowHour < 0) {
      return prices.length > 0;
    }

    const availableHours = new Set(prices.map(p => p.hour));

    for (let hour = 0; hour <= maxRequiredTomorrowHour; hour++) {
      if (!availableHours.has(hour)) {
        return false;
      }
    }

    return true;
  }

  private hasOvernightDevices(): boolean {
    if (!this.config.devices || !Array.isArray(this.config.devices)) {
      return false;
    }

    return this.config.devices.some(device => {
      const rangeStart = this.normalizeConfigHour(device.rangeStart, 0);
      const rangeEnd = this.normalizeConfigHour(device.rangeEnd, 23);

      return rangeStart > rangeEnd;
    });
  }

  private getMaxRequiredTomorrowHourForOvernightDevices(): number {
    if (!this.config.devices || !Array.isArray(this.config.devices)) {
      return -1;
    }

    let maxRequiredTomorrowHour = -1;

    for (const device of this.config.devices) {
      const rangeStart = this.normalizeConfigHour(device.rangeStart, 0);
      const rangeEnd = this.normalizeConfigHour(device.rangeEnd, 23);

      if (rangeStart > rangeEnd) {
        maxRequiredTomorrowHour = Math.max(maxRequiredTomorrowHour, rangeEnd);
      }
    }

    return maxRequiredTomorrowHour;
  }

  private normalizeConfigHour(value: unknown, fallback: number): number {
    let parsed = fallback;

    if (typeof value === 'number' && Number.isFinite(value)) {
      parsed = Math.floor(value);
    }

    if (typeof value === 'string') {
      const match = value.match(/\d+/);

      if (match) {
        const numberValue = parseInt(match[0], 10);

        if (Number.isFinite(numberValue)) {
          parsed = numberValue;
        }
      }
    }

    if (parsed < 0) {
      return 0;
    }

    if (parsed > 23) {
      return 23;
    }

    return parsed;
  }

  private formatPriceHours(prices: PriceHour[]): string {
    return prices
      .map(p => p.hour)
      .sort((a, b) => a - b)
      .map(hour => hour.toString().padStart(2, '0'))
      .join(', ');
  }
}
