"use strict";
const settings_1 = require("./settings");
const platform_1 = require("./platform");
module.exports = (api) => {
    // Rekisteröidään platform käyttäen sekä pluginin nimeä että platform-nimeä
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, platform_1.NordpoolPlatform);
};
//# sourceMappingURL=index.js.map