import { Logger, PlatformConfig } from 'homebridge';
export declare function eleringEE_getNordpoolData(log: Logger, config: PlatformConfig): Promise<{
    day: string;
    hour: number;
    price: number;
}[] | null>;
export declare function eleringEE_convertDataStructure(data: {
    timestamp: number;
    price: number;
}[], config: PlatformConfig): {
    day: string;
    hour: number;
    price: number;
}[];
//# sourceMappingURL=funcs_Elering.d.ts.map