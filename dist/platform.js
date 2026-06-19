"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NordpoolPlatform = void 0;
const settings_1 = require("./settings");
const platformAccessory_1 = require("./platformAccessory");
const functions_1 = require("./functions");
const node_cron_1 = require("node-cron");
class NordpoolPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.accessories = new Map();
        this.pricesCache = (0, settings_1.defaultPricesCache)(this.api, this.log);
        this.fnc = new functions_1.Functions(this, this.api);
        // Store references to accessory instances to trigger updates manually.
        this.activeAccessories = [];
        this.api.on('didFinishLaunching', async () => {
            this.log.debug('Executed didFinishLaunching callback');
            // 1. Fetch prices immediately upon startup.
            await this.updatePrices();
            // 2. Initialize devices.
            this.discoverDevices();
            // 3. Force initial state update for all discovered devices.
            // This ensures HomeKit gets the correct state immediately after boot.
            for (const accessory of this.activeAccessories) {
                await accessory.updateStatus();
            }
            // 4. Set up automatic price fetching from the API.
            // We run this at 2 minutes past the hour to avoid hitting the API
            // exactly on the hour when servers are busiest.
            (0, node_cron_1.schedule)('2 * * * *', async () => {
                await this.updatePrices();
                // Refresh accessories after price cache update.
                // This is useful when tomorrow's prices become available.
                for (const accessory of this.activeAccessories) {
                    await accessory.updateStatus();
                }
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
            const todayKey = (0, settings_1.fnc_todayKey)(this.config);
            const tomorrowKey = (0, settings_1.fnc_tomorrowKey)(this.config);
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
                this.log.info(`Prices updated for today (${todayKey}). Count: ${finalToday.length}`);
            }
            if (tomorrowPrices.length > 0) {
                const finalTomorrow = this.fnc.fillMissingHours(tomorrowPrices, tomorrowKey);
                await this.pricesCache.set(tomorrowKey, finalTomorrow);
                this.log.info(`Prices updated for tomorrow (${tomorrowKey}). Count: ${finalTomorrow.length}`);
            }
        }
        catch (error) {
            this.log.error('Error during price update:', error);
        }
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.set(accessory.UUID, accessory);
    }
    discoverDevices() {
        if (!this.config.devices || !Array.isArray(this.config.devices)) {
            this.log.warn('No devices found in configuration.');
            return;
        }
        this.activeAccessories.length = 0;
        const processedUUIDs = [];
        for (const device of this.config.devices) {
            const uuid = this.api.hap.uuid.generate(device.name);
            const existingAccessory = this.accessories.get(uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory:', device.name);
                // Always refresh cached accessory context from current config.
                existingAccessory.context.device = device;
                this.api.updatePlatformAccessories([existingAccessory]);
                const accInstance = new platformAccessory_1.NordpoolPlatformAccessory(this, existingAccessory, this.api);
                this.activeAccessories.push(accInstance);
            }
            else {
                this.log.info('Adding new accessory:', device.name);
                const accessory = new this.api.platformAccessory(device.name, uuid);
                // Store current config before constructing the accessory handler.
                accessory.context.device = device;
                const accInstance = new platformAccessory_1.NordpoolPlatformAccessory(this, accessory, this.api);
                this.activeAccessories.push(accInstance);
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
            processedUUIDs.push(uuid);
        }
        // Remove obsolete accessories that are no longer in the configuration.
        for (const [uuid, accessory] of this.accessories) {
            if (!processedUUIDs.includes(uuid)) {
                this.log.info('Removing accessory:', accessory.displayName);
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
        }
    }
}
exports.NordpoolPlatform = NordpoolPlatform;
//# sourceMappingURL=platform.js.map