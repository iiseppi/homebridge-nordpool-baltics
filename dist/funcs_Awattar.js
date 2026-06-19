"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.awattar_getNordpoolData = awattar_getNordpoolData;
exports.awattar_convertDataStructure = awattar_convertDataStructure;
const luxon_1 = require("luxon");
const settings_1 = require("./settings");
const axios_1 = __importDefault(require("axios"));
async function awattar_getNordpoolData(log, config) {
    const areaTimeZone = (0, settings_1.defaultAreaTimezone)(config);
    const tomorrow = luxon_1.DateTime.now().setZone(areaTimeZone).plus({ days: 2 }).startOf('day').toFormat('yyyy-MM-dd');
    const today = luxon_1.DateTime.now().setZone(areaTimeZone).minus({ days: 1 }).startOf('day').toFormat('yyyy-MM-dd');
    const domain = config.area.toLowerCase() === 'at' ? 'awattar.at' : 'awattar.de';
    const url = `https://api.${domain}/v1/marketdata?start=${today}&end=${tomorrow}`;
    try {
        const response = await axios_1.default.get(url, { timeout: 10000 });
        if (response.status !== 200) {
            log.warn(`WARN: Nordpool API provider 3 (Awattar) returned unusual response status ${response.status}`);
        }
        if (response.data && response.data.data) {
            const convertedData = awattar_convertDataStructure(response.data.data, config);
            return convertedData;
        }
        else {
            log.error(`ERR: Nordpool API provider 3 (Awattar) returned unusual data ${JSON.stringify(response.data)}`);
        }
    }
    catch (error) {
        log.error(`ERR: General Nordpool API provider 3 (Awattar) error: ${error}`);
    }
    return null;
}
function awattar_convertDataStructure(data, config) {
    var _a;
    const areaTimeZone = (0, settings_1.defaultAreaTimezone)(config);
    const decimalPrecision = (_a = config.decimalPrecision) !== null && _a !== void 0 ? _a : 1;
    return data.map((item) => {
        // start_timestamp is in milliseconds — convert in area timezone, not local system timezone
        const date = luxon_1.DateTime.fromMillis(item.start_timestamp).setZone(areaTimeZone);
        // marketprice is Eur/MWh, convert to cents/kWh by dividing by 10
        const price = parseFloat((item.marketprice / 10).toFixed(decimalPrecision));
        return {
            day: date.toFormat('yyyy-MM-dd'),
            hour: parseInt(date.toFormat('HH')),
            price: price,
        };
    });
}
//# sourceMappingURL=funcs_Awattar.js.map