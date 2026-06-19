"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eleringEE_getNordpoolData = eleringEE_getNordpoolData;
exports.eleringEE_convertDataStructure = eleringEE_convertDataStructure;
const luxon_1 = require("luxon");
const settings_1 = require("./settings");
const axios_1 = __importDefault(require("axios"));
async function eleringEE_getNordpoolData(log, config) {
    // logic and format resembles elering implementation on nordpool-cf/src/worker.js
    const url = `https://pub-460c981173fb4262a268d6f273d18dd2.r2.dev/elering_${config.area.toUpperCase()}.json`;
    try {
        const response = await axios_1.default.get(url, { timeout: 10000 });
        if (response.status !== 200) {
            log.warn(`WARN: Nordpool API provider 1 returned unusual response status ${response.status}`);
        }
        if (response.data) {
            const convertedData = eleringEE_convertDataStructure(response.data, config);
            return convertedData;
        }
        else {
            log.error(`ERR: Nordpool API provider 1 returned unusual data ${JSON.stringify(response.data)}`);
        }
    }
    catch (error) {
        log.error(`ERR: General Nordpool API provider 1 error: ${error}`);
    }
    return null;
}
function eleringEE_convertDataStructure(data, config) {
    var _a;
    const areaTimeZone = (0, settings_1.defaultAreaTimezone)(config);
    const decimalPrecision = (_a = config.decimalPrecision) !== null && _a !== void 0 ? _a : 1;
    return data.map((item) => {
        // convert the timestamp to ISO string, then to timezone in the area
        const date = luxon_1.DateTime.fromISO(new Date(item.timestamp * 1000).toISOString()).setZone(areaTimeZone);
        // divide by 10 to convert price to cents per kWh
        item.price = parseFloat((item.price / 10).toFixed(decimalPrecision));
        return {
            day: date.toFormat('yyyy-MM-dd'),
            hour: parseInt(date.toFormat('HH')),
            price: item.price,
        };
    });
}
//# sourceMappingURL=funcs_Elering.js.map