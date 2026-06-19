import { Logger, PlatformConfig } from 'homebridge';
export declare function spothinta_getNordpoolData(log: Logger, config: PlatformConfig): Promise<{
    day: string;
    hour: number;
    price: number;
}[] | null>;
export declare function spothinta_convertDataStructure(data: {
    DateTime: string;
    PriceNoTax: number;
}[], config: PlatformConfig): {
    day: string;
    hour: number;
    price: number;
}[];
//# sourceMappingURL=funcs_SpotHinta.d.ts.map