import { API } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { NordpoolPlatform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  // Rekisteröidään platform käyttäen sekä pluginin nimeä että platform-nimeä
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, NordpoolPlatform);
};