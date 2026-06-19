import { PlatformAccessory, API } from 'homebridge';
import { NordpoolPlatform } from './platform';
type PricePoint = {
    day: number;
    hour: number;
    price: number;
};
type PricePointWithDate = PricePoint & {
    dateKey: string;
};
export declare class NordpoolPlatformAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly api;
    private service;
    private historyService;
    private pricesCache;
    private deviceConfig;
    constructor(platform: NordpoolPlatform, accessory: PlatformAccessory, api: API);
    updateStatus(): Promise<void>;
    calculateCheapestStatus(allPrices: PricePointWithDate[], todayKey: string, tomorrowKey: string): Promise<boolean>;
    private calculateSameDayStatus;
    private calculateOvernightStatus;
    private setHomeKitAndHistoryState;
    private selectCheapestHours;
    private logCalculatedSchedule;
    private logStoredOvernightSchedule;
    private sortChronologically;
    private withDateKey;
    private priceHourKey;
    private dateTimeHourKey;
    private overnightScheduleCacheKey;
    private expectedWindowHourCount;
    private normalizeDeviceConfig;
    private normalizeHour;
    private normalizeNumber;
    private padHour;
}
export {};
//# sourceMappingURL=platformAccessory.d.ts.map