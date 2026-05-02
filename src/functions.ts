import { API, Logging, PlatformConfig } from 'homebridge';
import { NordpoolPlatform } from './platform';
import { eleringEE_getNordpoolData } from './funcs_Elering';
import { spothinta_getNordpoolData } from './funcs_SpotHinta';
import { awattar_getNordpoolData } from './funcs_Awattar';
import { omie_getNordpoolData } from './funcs_OMIE';
import {
  fnc_todayKey,
  defaultAreaTimezone,
  pricing,
  NordpoolData,
  defaultPricesCache
} from './settings';

import { DateTime } from 'luxon';
import * as asciichart from 'asciichart';

export class Functions {
  private decimalPrecision = this.platform.config.decimalPrecision ?? 1;
  private plotTheChart: boolean = this.platform.config.plotTheChart ?? false;
  private pricesCache = defaultPricesCache(this.api, this.platform.log as Logging);

  constructor(
    private readonly platform: NordpoolPlatform,
    private readonly api: API,
  ) { }

  /**
   * Fetches Nordpool data from different providers based on the region
   */
  async pullNordpoolData(): Promise<NordpoolData[] | null> {
    try {
      let rawData: any[] | null = null;
      const area = this.platform.config.area || 'FI';

      if (area.match(/^(LT|LV|EE|FI)$/)) {
        rawData = await eleringEE_getNordpoolData(this.platform.log, this.platform.config);
      }

      if (!rawData && area.match(/^(DE|LU|AT)$/)) {
        rawData = await awattar_getNordpoolData(this.platform.log, this.platform.config);
      }

      if (!rawData && area.match(/^(ES|PT)$/)) {
        rawData = await omie_getNordpoolData(this.platform.log, this.platform.config);
      }

      // Fallback or other countries
      if (!rawData) {
        rawData = await spothinta_getNordpoolData(this.platform.log, this.platform.config);
      }

      if (!rawData) {
        this.platform.log.warn(`[API] No response from any provider for ${area} area`);
        return null;
      }

      // Ensure 'day' property is a number (day of month) to match our interface
      const sanitizedData: NordpoolData[] = rawData.map(item => ({
        ...item,
        day: typeof item.day === 'string' ? parseInt(item.day.split('-').pop() || '0') : item.day
      }));

      const hourlyData = this.convertToHourlyAverages(sanitizedData);

      if (this.plotTheChart) {
        this.plotPricesChart(hourlyData);
      }

      return hourlyData;
    } catch (error) {
      this.platform.log.error('[API] Error pulling data:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Applies solar panels impact (price 0 during specific hours)
   */
  async applySolarOverride(data: NordpoolData[]): Promise<NordpoolData[]> {
    const config = this.platform.config;
    if (!config.solarOverride) {
      return data;
    }

    const today = DateTime.local().setZone(defaultAreaTimezone(config));
    if (today.month < 3 || today.month > 9) {
      return data; // Valid only from March to September
    }

    const start = config.solarOverrideJuneHourStart ?? 10;
    const end = config.solarOverrideJuneHourEnd ?? 17;

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
  plotPricesChart(data: NordpoolData[]) {
    try {
      const priceData = data.map(elem => elem.price);
      const chart = asciichart.plot(priceData, {
        padding: '      ',
        height: 7,
      });

      this.platform.log.info('\n' + chart);
    } catch (e) {
      this.platform.log.debug('Could not plot chart');
    }
  }

  /**
   * Fixes missing or extra hours (e.g., Daylight Saving Time transitions)
   * Ensures the returned array always has exactly 24 items with hours 0-23.
   */
  fillMissingHours(data: NordpoolData[], dayKey: string): NordpoolData[] {
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
  private convertToHourlyAverages(data: NordpoolData[]): NordpoolData[] {
    const hourlyDataMap = new Map<string, { total: number; count: number; hour: number; day: number }>();

    data.forEach(item => {
      const key = `${item.day}-${item.hour}`;
      if (!hourlyDataMap.has(key)) {
        hourlyDataMap.set(key, { total: item.price, count: 1, hour: item.hour, day: item.day });
      } else {
        const existing = hourlyDataMap.get(key)!;
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
