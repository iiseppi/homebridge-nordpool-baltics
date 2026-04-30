import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { NordpoolPlatformAccessory } from './platformAccessory';

/**
 * NordpoolPlatform
 * This class handles the config and discovery of dynamic price sensors.
 */
export class NordpoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // Track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  /**
   * Homebridge calls this method to restore cached accessories.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Discovers and registers accessories based on the user configuration.
   */
  discoverDevices() {
    // 1. Check if there are any devices configured
    if (!this.config.devices || !Array.isArray(this.config.devices)) {
      this.log.warn('No devices found in configuration. Please add devices in the plugin settings.');
      return;
    }

    const processedUUIDs: string[] = [];

    // 2. Loop over the configured devices
    for (const device of this.config.devices) {
      // Use device name to generate a unique UUID
      const uuid = this.api.hap.uuid.generate(device.name);
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // Accessory already exists, restore it
        this.log.info('Restoring existing accessory:', device.name);

        // Update context with the latest settings from config
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        new NordpoolPlatformAccessory(this, existingAccessory, this.api);
      } else {
        // Create new accessory
        this.log.info('Adding new accessory:', device.name);

        const accessory = new this.api.platformAccessory(device.name, uuid);

        // Store device settings in context
        accessory.context.device = device;

        new NordpoolPlatformAccessory(this, accessory, this.api);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      processedUUIDs.push(uuid);
    }

    // 3. Remove accessories that are no longer in the configuration
    for (const [uuid, accessory] of this.accessories) {
      if (!processedUUIDs.includes(uuid)) {
        this.log.info('Removing removed accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}