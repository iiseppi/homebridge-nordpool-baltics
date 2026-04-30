import { PlatformAccessory, API, Logging, Service, CharacteristicValue } from 'homebridge';
import { NordpoolPlatform } from './platform';
import { fnc_todayKey, fnc_tomorrowKey, defaultPricesCache } from './settings';
import { schedule } from 'node-cron';

export class NordpoolPlatformAccessory {
  private service: Service;
  private pricesCache = defaultPricesCache(this.api, this.platform.log as Logging);
  private deviceConfig: { name: string, cheapestHours: number, rangeStart: number, rangeEnd: number };

  constructor(
    private readonly platform: NordpoolPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: API,
  ) {
    // Haetaan laitekohtaiset asetukset contextista
    this.deviceConfig = accessory.context.device;

    // Asetetaan laitteen tiedot
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Nordpool')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dynamic Price Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    // Käytetään Contact Sensor -tyyppiä (yleisin näissä plugineissa)
    // Jos haluat Switchin, vaihda Service.ContactSensor -> Service.Switch
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.deviceConfig.name);

    // Käynnistetään hintojen haku ja asetetaan kronometri tunnin välein
    this.updateStatus();

    schedule('0 * * * *', () => {
      this.platform.log.info(`[${this.deviceConfig.name}] Hourly update triggered.`);
      this.updateStatus();
    });
  }

  async updateStatus() {
    const todayKey = fnc_todayKey(this.platform.config);
    const cachedToday = await this.pricesCache.get(todayKey);

    if (!Array.isArray(cachedToday) || cachedToday.length === 0) {
      this.platform.log.warn(`[${this.deviceConfig.name}] No price data available in cache yet.`);
      return;
    }

    const isCurrentlyOn = this.calculateCheapestStatus(cachedToday);

    // HomeKitissa ContactSensor: 0 = DETECTED (On), 1 = NOT_DETECTED (Off)
    // Jos käytät Switchiä, käytä: this.platform.Characteristic.On, isCurrentlyOn
    const characteristic = this.platform.Characteristic.ContactSensorState;
    const value = isCurrentlyOn
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    this.service.updateCharacteristic(characteristic, value);

    this.platform.log.info(`[${this.deviceConfig.name}] Status update: ${isCurrentlyOn ? 'ON' : 'OFF'}`);
  }

  calculateCheapestStatus(prices: any[]): boolean {
    const currentHour = new Date().getHours();
    const { rangeStart, rangeEnd, cheapestHours } = this.deviceConfig;

    // 1. Suodatetaan tunnit aikavälin mukaan
    const windowPrices = prices.filter(p => {
      if (rangeStart <= rangeEnd) {
        // Normaali aikaväli (esim. 08-16)
        return p.hour >= rangeStart && p.hour <= rangeEnd;
      } else {
        // Yön yli menevä väli (esim. 23-06)
        return p.hour >= rangeStart || p.hour <= rangeEnd;
      }
    });

    if (windowPrices.length === 0) {
      return false;
    }

    // 2. Järjestetään hinnan mukaan (halvin ensin)
    const sortedWindow = [...windowPrices].sort((a, b) => a.price - b.price);

    // 3. Poimitaan X halvinta tuntia
    const cheapestHoursArray = sortedWindow
      .slice(0, Math.min(cheapestHours, windowPrices.length))
      .map(p => p.hour);

    this.platform.log.debug(`[${this.deviceConfig.name}] Window hours: ${windowPrices.map(p => p.hour).join(',')}`);
    this.platform.log.debug(`[${this.deviceConfig.name}] Cheapest hours in window: ${cheapestHoursArray.join(',')}`);

    // 4. Tarkistetaan onko nykyinen tunti yksi valituista
    return cheapestHoursArray.includes(currentHour);
  }
}