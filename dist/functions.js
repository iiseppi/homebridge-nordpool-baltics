"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Functions = void 0;
const funcs_Elering_1 = require("./funcs_Elering");
const funcs_SpotHinta_1 = require("./funcs_SpotHinta");
const funcs_Awattar_1 = require("./funcs_Awattar");
const funcs_OMIE_1 = require("./funcs_OMIE");
const settings_1 = require("./settings");
const luxon_1 = require("luxon");
const asciichart = __importStar(require("asciichart"));
class Functions {
    constructor(platform, api) {
        var _a, _b;
        this.platform = platform;
        this.api = api;
        this.decimalPrecision = (_a = this.platform.config.decimalPrecision) !== null && _a !== void 0 ? _a : 1;
        this.plotTheChart = (_b = this.platform.config.plotTheChart) !== null && _b !== void 0 ? _b : false;
        this.pricesCache = (0, settings_1.defaultPricesCache)(this.api, this.platform.log);
    }
    /**
     * Fetches Nordpool data from different providers based on the region
     */
    async pullNordpoolData() {
        try {
            let rawData = null;
            const area = this.platform.config.area || 'FI';
            if (area.match(/^(LT|LV|EE|FI)$/)) {
                rawData = await (0, funcs_Elering_1.eleringEE_getNordpoolData)(this.platform.log, this.platform.config);
            }
            if (!rawData && area.match(/^(DE|LU|AT)$/)) {
                rawData = await (0, funcs_Awattar_1.awattar_getNordpoolData)(this.platform.log, this.platform.config);
            }
            if (!rawData && area.match(/^(ES|PT)$/)) {
                rawData = await (0, funcs_OMIE_1.omie_getNordpoolData)(this.platform.log, this.platform.config);
            }
            // Fallback or other countries
            if (!rawData) {
                rawData = await (0, funcs_SpotHinta_1.spothinta_getNordpoolData)(this.platform.log, this.platform.config);
            }
            if (!rawData) {
                this.platform.log.warn(`[API] No response from any provider for ${area} area`);
                return null;
            }
            // Ensure 'day' property is a number (day of month) to match our interface
            const sanitizedData = rawData.map(item => ({
                ...item,
                day: typeof item.day === 'string' ? parseInt(item.day.split('-').pop() || '0') : item.day
            }));
            const hourlyData = this.convertToHourlyAverages(sanitizedData);
            if (this.plotTheChart) {
                this.plotPricesChart(hourlyData);
            }
            return hourlyData;
        }
        catch (error) {
            this.platform.log.error('[API] Error pulling data:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }
    /**
     * Applies solar panels impact (price 0 during specific hours)
     */
    async applySolarOverride(data) {
        var _a, _b;
        const config = this.platform.config;
        if (!config.solarOverride) {
            return data;
        }
        const today = luxon_1.DateTime.local().setZone((0, settings_1.defaultAreaTimezone)(config));
        if (today.month < 3 || today.month > 9) {
            return data; // Valid only from March to September
        }
        const start = (_a = config.solarOverrideJuneHourStart) !== null && _a !== void 0 ? _a : 10;
        const end = (_b = config.solarOverrideJuneHourEnd) !== null && _b !== void 0 ? _b : 17;
        this.platform.log.info(`[Solar] Overriding prices to 0 cents between ${start}:00 - ${end}:00`);
        return data.map(p => {
            if (p.hour >= start && p.hour <= end) {
                return { ...p, price: 0 };
            }
            return p;
        });
    }
    /**
     * Plots price chart in ASCII format to logs
     */
    plotPricesChart(data) {
        try {
            const priceData = data.map(elem => elem.price);
            const chart = asciichart.plot(priceData, {
                padding: '      ',
                height: 7,
            });
            this.platform.log.info('\n' + chart);
        }
        catch (e) {
            this.platform.log.debug('Could not plot chart');
        }
    }
    /**
     * Fixes missing or extra hours (e.g., Daylight Saving Time transitions)
     * Ensures the returned array always has exactly 24 items with hours 0-23.
     */
    fillMissingHours(data, dayKey) {
        // If the data is already perfectly 24 hours, return it as-is
        if (data.length === 24) {
            return data;
        }
        // Convert dayKey (string) to day (number)
        const dayNumber = parseInt(dayKey.split('-').pop() || '0');
        const fixedData = [...data].sort((a, b) => a.hour - b.hour);
        // SPRING: DST spring-forward (23 hours)
        if (fixedData.length === 23) {
            this.platform.log.debug(`[DST] 23-hour day detected for ${dayKey}. Padding to 24 hours.`);
            let gapFound = false;
            for (let i = 0; i < fixedData.length - 1; i++) {
                // Look for the missing hour gap (e.g., jumps from 2 to 4)
                if (fixedData[i + 1].hour !== fixedData[i].hour + 1) {
                    const missingHour = fixedData[i].hour + 1;
                    // Duplicate the current hour's price to fill the gap
                    fixedData.splice(i + 1, 0, {
                        ...fixedData[i],
                        hour: missingHour,
                        day: dayNumber,
                    });
                    gapFound = true;
                    break;
                }
            }
            // Fallback: If no explicit gap was found, just duplicate the 2nd hour (night time)
            if (!gapFound) {
                fixedData.splice(2, 0, { ...fixedData[2] });
            }
        }
        // AUTUMN: DST fall-back (25 hours)
        else if (fixedData.length === 25) {
            this.platform.log.debug(`[DST] 25-hour day detected for ${dayKey}. Truncating to 24 hours.`);
            // Remove the duplicated extra hour (typically index 3 during the night shift)
            fixedData.splice(3, 1);
        }
        // Ensure all hours are strictly mapped 0-23 to prevent downstream indexing errors
        return fixedData.map((item, idx) => ({ ...item, hour: idx }));
    }
    /**
     * Converts multi-point data to hourly averages
     */
    convertToHourlyAverages(data) {
        const hourlyDataMap = new Map();
        data.forEach(item => {
            const key = `${item.day}-${item.hour}`;
            if (!hourlyDataMap.has(key)) {
                hourlyDataMap.set(key, { total: item.price, count: 1, hour: item.hour, day: item.day });
            }
            else {
                const existing = hourlyDataMap.get(key);
                existing.total += item.price;
                existing.count += 1;
            }
        });
        return Array.from(hourlyDataMap.values()).map(({ day, hour, total, count }) => ({
            day,
            hour,
            price: parseFloat((total / count).toFixed(this.decimalPrecision)),
        }));
    }
}
exports.Functions = Functions;
//# sourceMappingURL=functions.js.map