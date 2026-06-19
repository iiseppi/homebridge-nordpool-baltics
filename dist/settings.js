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
exports.defaultService = exports.pricing = exports.PLATFORM_SERIAL_NUMBER = exports.PLATFORM_MODEL = exports.PLATFORM_VERSION = exports.PLATFORM_MANUFACTURER = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
exports.defaultPricesCache = defaultPricesCache;
exports.defaultAreaTimezone = defaultAreaTimezone;
exports.fnc_todayKey = fnc_todayKey;
exports.fnc_tomorrowKey = fnc_tomorrowKey;
exports.fnc_currentHour = fnc_currentHour;
const Path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const luxon_1 = require("luxon");
const file_system_cache_1 = require("file-system-cache");
/* eslint @typescript-eslint/no-var-requires: "off" */
const pkg = require('../package.json');
// Platform constants updated for the new plugin name
exports.PLATFORM_NAME = 'NordpoolCheapestRange';
exports.PLUGIN_NAME = pkg.name;
exports.PLATFORM_MANUFACTURER = pkg.author.name || 'iiseppi';
exports.PLATFORM_VERSION = pkg.version;
exports.PLATFORM_MODEL = 'Nordpool Smart Range Sensors';
exports.PLATFORM_SERIAL_NUMBER = 'NPS-RANGE-2026';
exports.pricing = {
    today: [],
    currently: 0.0001,
    currentHour: 0,
    median: 0,
};
/**
 * Default structure for sensors.
 */
exports.defaultService = {
    currently: null,
};
/**
 * Cache settings. Updated namespace (ns) and storage logic.
 */
function defaultPricesCache(api, log) {
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
    }
    catch (error) {
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
    }
    catch (e) {
        log.debug('Cache cleanup skipped or failed.');
    }
    return new file_system_cache_1.Cache({ basePath: finalCacheDirectory, ns: ns, ttl: 172800 });
}
/**
 * Timezone mapping based on Nordpool market areas.
 */
function defaultAreaTimezone(config) {
    const area = (config.area || 'FI').toUpperCase();
    const timezoneMapping = {
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
function fnc_todayKey(config) {
    const timezone = defaultAreaTimezone(config);
    return luxon_1.DateTime.local().setZone(timezone).toFormat('yyyy-MM-dd');
}
/**
 * Returns cache key for tomorrow's date in the correct timezone.
 */
function fnc_tomorrowKey(config) {
    const timezone = defaultAreaTimezone(config);
    return luxon_1.DateTime.local().plus({ day: 1 }).setZone(timezone).toFormat('yyyy-MM-dd');
}
/**
 * Returns current hour in the correct timezone.
 */
function fnc_currentHour(config) {
    const timezone = defaultAreaTimezone(config);
    return luxon_1.DateTime.local().setZone(timezone).hour;
}
//# sourceMappingURL=settings.js.map