import { Logger, PlatformConfig } from 'homebridge';
export declare function awattar_getNordpoolData(log: Logger, config: PlatformConfig): Promise<{
    day: string;
    hour: number;
    price: number;
}[] | null>;
export declare function awattar_convertDataStructure(data: {
    start_timestamp: number;
    marketprice: number;
}[], config: PlatformConfig): {
    day: string;
    hour: number;
    price: number;
}[];
//# sourceMappingURL=funcs_Awattar.d.ts.map