"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.spothinta_getNordpoolData = spothinta_getNordpoolData;
exports.spothinta_convertDataStructure = spothinta_convertDataStructure;
const axios_1 = __importDefault(require("axios"));
const luxon_1 = require("luxon");
const settings_1 = require("./settings");
async function spothinta_getNordpoolData(log, config) {
    const area = config.area.toUpperCase(); // Ensure the area is in uppercase (e.g., SE1, SE2, etc.)
    const reqDate = luxon_1.DateTime.now().setZone((0, settings_1.defaultAreaTimezone)(config)).toFormat('yyyy-MM-dd');
    const url = `https://api.spot-hinta.fi/TodayAndDayForward?reqDate=${reqDate}&region=${area}`;
    try {
        const response = await axios_1.default.get(url, { timeout: 10000 });
        if (response.status !== 200) {
            log.warn(`WARN: Nordpool API provider 2 returned unusual response status ${response.status}`);
            return null;
        }
        if (!response.data || response.data.length < 23) {
            log.error(`ERR: Nordpool API provider 2 returned unusual data ${JSON.stringify(response.data)}`);
            return null;
        }
        const convertedData = spothinta_convertDataStructure(response.data, config);
        return convertedData;
    }
    catch (error) {
        log.error(`ERR: General Nordpool API provider 2 error: ${error}`);
        return null;
    }
}
function spothinta_convertDataStructure(data, config) {
    var _a;
    const decimalPrecision = (_a = config.decimalPrecision) !== null && _a !== void 0 ? _a : 1;
    return data
        .map((item) => {
        // Convert timestamp from ISO
        const date = luxon_1.DateTime.fromISO(item['DateTime']).setZone((0, settings_1.defaultAreaTimezone)(config));
        // Convert price from EUR to Cents per kWh
        const price = parseFloat((item['PriceNoTax'] * 100).toFixed(decimalPrecision));
        return {
            day: date.toFormat('yyyy-MM-dd'),
            hour: parseInt(date.toFormat('HH')),
            price,
        };
    });
}
//# sourceMappingURL=funcs_SpotHinta.js.map