import { Service, API, Logging, PlatformConfig } from 'homebridge';
import { Cache } from 'file-system-cache';
export declare const PLATFORM_NAME = "NordpoolCheapestRange";
export declare const PLUGIN_NAME: any;
export declare const PLATFORM_MANUFACTURER: any;
export declare const PLATFORM_VERSION: any;
export declare const PLATFORM_MODEL = "Nordpool Smart Range Sensors";
export declare const PLATFORM_SERIAL_NUMBER = "NPS-RANGE-2026";
export interface SensorType {
    [key: string]: Service | null;
}
export interface NordpoolData {
    day: number;
    hour: number;
    price: number;
}
/**
 * Simplified Pricing interface.
 * Since each device calculates its own cheap hours on the fly,
 * we globally provide raw data and current state info.
 */
export interface Pricing {
    today: NordpoolData[];
    currently: number;
    currentHour: number;
    median: number;
}
export declare let pricing: Pricing;
/**
 * Default structure for sensors.
 */
export declare const defaultService: SensorType;
/**
 * Cache settings. Updated namespace (ns) and storage logic.
 */
export declare function defaultPricesCache(api: API, log: Logging): Cache;
/**
 * Timezone mapping based on Nordpool market areas.
 */
export declare function defaultAreaTimezone(config: PlatformConfig): string;
/**
 * Returns cache key for today's date in the correct timezone.
 */
export declare function fnc_todayKey(config: PlatformConfig): string;
/**
 * Returns cache key for tomorrow's date in the correct timezone.
 */
export declare function fnc_tomorrowKey(config: PlatformConfig): string;
/**
 * Returns current hour in the correct timezone.
 */
export declare function fnc_currentHour(config: PlatformConfig): number;
//# sourceMappingURL=settings.d.ts.map