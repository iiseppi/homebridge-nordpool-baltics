import { API } from 'homebridge';
import { NordpoolPlatform } from './platform';
import { NordpoolData } from './settings';
export declare class Functions {
    private readonly platform;
    private readonly api;
    private decimalPrecision;
    private plotTheChart;
    private pricesCache;
    constructor(platform: NordpoolPlatform, api: API);
    /**
     * Fetches Nordpool data from different providers based on the region
     */
    pullNordpoolData(): Promise<NordpoolData[] | null>;
    /**
     * Applies solar panels impact (price 0 during specific hours)
     */
    applySolarOverride(data: NordpoolData[]): Promise<NordpoolData[]>;
    /**
     * Plots price chart in ASCII format to logs
     */
    plotPricesChart(data: NordpoolData[]): void;
    /**
     * Fixes missing or extra hours (e.g., Daylight Saving Time transitions)
     * Ensures the returned array always has exactly 24 items with hours 0-23.
     */
    fillMissingHours(data: NordpoolData[], dayKey: string): NordpoolData[];
    /**
     * Converts multi-point data to hourly averages
     */
    private convertToHourlyAverages;
}
//# sourceMappingURL=functions.d.ts.map