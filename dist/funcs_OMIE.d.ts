import { Logger, PlatformConfig } from 'homebridge';
export declare function omie_convertDataStructure(csvText: string, area: string, config: PlatformConfig): {
    day: string;
    hour: number;
    price: number;
}[];
export declare function omie_getNordpoolData(log: Logger, config: PlatformConfig): Promise<{
    day: string;
    hour: number;
    price: number;
}[] | null>;
//# sourceMappingURL=funcs_OMIE.d.ts.map