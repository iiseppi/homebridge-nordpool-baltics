import { Service, API, Logging, PlatformConfig } from 'homebridge';
import * as Path from 'path';
import * as fs from 'fs';
import { DateTime } from 'luxon';
import { Cache } from 'file-system-cache';

/* eslint @typescript-eslint/no-var-requires: "off" */
const pkg = require('../package.json');

// Platform constants updated for the new plugin name
export const PLATFORM_NAME = 'NordpoolCheapestRange';
export const PLUGIN_NAME = pkg.name;
export const PLATFORM_MANUFACTURER = pkg.author.name || 'iiseppi';
export const PLATFORM_VERSION = pkg.version;
export const PLATFORM_MODEL = 'Nordpool Smart Range Sensors';
export const PLATFORM_SERIAL_NUMBER = 'NPS-RANGE-2026';

export interface SensorType { [key: string]: Service | null }

export interface NordpoolData {
  day: number; // Stored as day of month for easy comparison
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

export let pricing: Pricing = {
  today: [],
  currently: 0.0001,
  currentHour: 0,
  median: 0,
};

/**
 * Default structure for sensors.
 */
export const defaultService: SensorType = {
  currently: null,
};

/**
 * Cache settings. Updated namespace (ns) and storage logic.
 */
export function defaultPricesCache(api: API, log: Logging) {
  const ns = 'homebridge-nordpool-cheapest-range';
  const nsHash = 'npr-8c8d8b8a8b8c8d8e8f'; // Identifier for cache files

  const storagePath = api.user.storagePath();
  const cacheDirectory = Path.join(storagePath, '.cache');
  const fallbackDirectory = storagePath;
  let finalCacheDirectory = cacheDirectory;

  // Ensure cache directory exists and is writable
  try {
    if (!fs.existsSync(cacheDirectory)) {
      fs.mkdirSync(cacheDirectory, { recursive: true });
      log.debug(`OK: Cache directory created at ${cacheDirectory}`);
    }
    fs.accessSync(cacheDirectory, fs.constants.W_OK);
  } catch (error) {
    log.warn(`Failed to access cache directory, falling back to root: ${fallbackDirectory}`);
    finalCacheDirectory = fallbackDirectory;
  }

  // Cleanup old cache files (older than 2 days)
  try {
    const files = fs.readdirSync(finalCacheDirectory);
    const now = Date.now();
    files.filter(file => file.includes(ns)).forEach(file => {
      const filePath = Path.join(finalCacheDirectory, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs >= 172800 * 1000) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (e) {
    log.debug('Cache cleanup skipped or failed.');
  }

  return new Cache({ basePath: finalCacheDirectory, ns: ns, ttl: 172800 });
}

/**
 * Timezone mapping based on Nordpool market areas.
 */
export function defaultAreaTimezone(config: PlatformConfig): string {
  const area = (config.area || 'FI').toUpperCase();

  const timezoneMapping: { [key: string]: string } = {
    LT: 'Europe/Vilnius', FI: 'Europe/Helsinki',
    LV: 'Europe/Riga', EE: 'Europe/Tallinn',
    SE1: 'Europe/Stockholm', SE2: 'Europe/Stockholm', SE3: 'Europe/Stockholm', SE4: 'Europe/Stockholm',
    DK1: 'Europe/Copenhagen', DK2: 'Europe/Copenhagen',
    NO1: 'Europe/Oslo', NO2: 'Europe/Oslo', NO3: 'Europe/Oslo', NO4: 'Europe/Oslo', NO5: 'Europe/Oslo',
    DE: 'Europe/Berlin', LU: 'Europe/Luxembourg', AT: 'Europe/Vienna',
    ES: 'Europe/Madrid', PT: 'Europe/Lisbon',
  };

  return timezoneMapping[area] || 'Europe/Helsinki';
}

/**
 * Returns cache key for today's date in the correct timezone.
 */
export function fnc_todayKey(config: PlatformConfig) {
  const timezone = defaultAreaTimezone(config);
  return DateTime.local().setZone(timezone).toFormat('yyyy-MM-dd');
}

/**
 * Returns cache key for tomorrow's date in the correct timezone.
 */
export function fnc_tomorrowKey(config: PlatformConfig) {
  const timezone = defaultAreaTimezone(config);
  return DateTime.local().plus({ day: 1 }).setZone(timezone).toFormat('yyyy-MM-dd');
}

/**
 * Returns current hour in the correct timezone.
 */
export function fnc_currentHour(config: PlatformConfig) {
  const timezone = defaultAreaTimezone(config);
  return DateTime.local().setZone(timezone).hour;
}