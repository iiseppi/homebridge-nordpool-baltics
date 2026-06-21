import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
export declare class NordpoolPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: Map<string, PlatformAccessory>;
    private readonly pricesCache;
    private readonly fnc;
    private readonly activeAccessories;
    private lastCompleteTomorrowKey?;
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * Centralized function to fetch prices from the API and store them in the local cache.
     */
    updatePrices(): Promise<void>;
    configureAccessory(accessory: PlatformAccessory): void;
    discoverDevices(): void;
    private refreshPricesAndAccessories;
    private updateActiveAccessoryStatuses;
    private needsTomorrowPriceRefresh;
    private isTomorrowPriceDataUsableForConfiguredDevices;
    private hasOvernightDevices;
    private getMaxRequiredTomorrowHourForOvernightDevices;
    private normalizeConfigHour;
    private formatPriceHours;
}
//# sourceMappingURL=platform.d.ts.map