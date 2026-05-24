# Homebridge Nordpool Cheapest Range

<p align="center">
  <a href="https://www.npmjs.com/package/homebridge-nordpool-cheapest-range"><img src="https://img.shields.io/npm/v/homebridge-nordpool-cheapest-range.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/homebridge-nordpool-cheapest-range"><img src="https://img.shields.io/npm/dt/homebridge-nordpool-cheapest-range.svg" alt="npm downloads"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

Automate heavy appliances during the cheapest Nordpool electricity hours within your custom time windows. 

This Homebridge plugin creates virtual **Contact Sensors** in HomeKit. The sensor opens (triggers) when the electricity is at its cheapest within a specific time frame that you define, allowing you to run water heaters, EV chargers, or heat pumps at the most optimal times.

*🇫🇮 Suomenkieliset ohjeet löytyvät alempaa.*

---

## Features

- **Custom Time Windows**: Define when your appliance can run (e.g., only between 20:00 and 08:00).
- **Cheapest Hours**: Set how many hours the appliance needs to run within that window (e.g., the 3 cheapest hours).
- **"Double Pulse" Reliability**: HomeKit automations can sometimes miss long, continuous states. This plugin uses a specialized "Double Pulse" strategy: every hour, the sensor briefly toggles its state to guarantee that your automations are reliably triggered, even if you create them mid-cycle.
- **Eve App History Support**: Fully supports Fakegato-history. View your cheap/expensive hour logs beautifully graphed in the Eve app.
- **Solar Override**: Includes support for solar panel overrides (if configured).

## How It Works in HomeKit

To prevent accidental manual toggles by users, this plugin exposes devices as **Contact Sensors** (Door/Window sensors). 

* **OPEN (Contact Not Detected)** = Electricity is CHEAP. Turn your appliances ON.
* **CLOSED (Contact Detected)** = Electricity is EXPENSIVE. Turn your appliances OFF.

### Example Automation Setup
1. Open the Apple Home app -> **Automations** -> **+** -> **A Sensor Detects Something**.
2. **Turn ON Automation:** Select your Cheapest Range sensor -> *Opens* -> Select your appliance (e.g., Water Heater) -> Turn ON.
3. **Turn OFF Automation:** Select your Cheapest Range sensor -> *Closes* -> Select your appliance -> Turn OFF.

## Installation

1. Install Homebridge.
2. Install this plugin: `npm install -g homebridge-nordpool-cheapest-range`
3. Configure the plugin through the Homebridge UI or update your `config.json`.

## Configuration Example

```json
    
{
  "platforms": [
    {
      "platform": "NordpoolCheapestRange",
      "devices": [
        {
          "name": "Water Heater",
          "cheapestHours": 3,
          "rangeStart": 22,
          "rangeEnd": 7
        },
        {
          "name": "EV Charger",
          "cheapestHours": 5,
          "rangeStart": 0,
          "rangeEnd": 23
        }
      ]
    }
  ]
}
```


🇫🇮 Suomenkieliset ohjeet (Finnish)

Automatisoi raskaat kodinkoneet Nordpoolin halvimpien tuntien aikana valitsemasi aikaikkunan sisällä.

Tämä Homebridge-liitännäinen luo HomeKitiin virtuaalisia Ovitunnistimia (Contact Sensor). Tunnistin "aukeaa", kun sähkö on halvimmillaan määrittämäsi aikajakson sisällä. Tämän avulla voit ohjata esimerkiksi lämminvesivaraajaa, sähköauton laturia tai lämpöpumppua juuri silloin, kun se on edullisinta.

## Ominaisuudet
- **Kustomoidut aikaikkunat**: Määritä, milloin laitteesi saa olla päällä (esim. vain klo 20:00–08:00 välillä).

- **Halvimmat tunnit**: Valitse, kuinka monta tuntia laitteen pitää olla päällä kyseisen aikaikkunan sisällä (esim. 3 halvinta tuntia).

- **Kaksoispulssi-varmistus (Double Pulse)**: HomeKit-automaatiot saattavat toisinaan jättää reagoimatta pitkään jatkuviin tiloihin. Tämä plugin käyttää kaksoispulssitekniikkaa: sensori vaihtaa tilaansa hetkellisesti joka tasatunti, mikä takaa automaatioidesi sataprosenttisen laukeamisen, vaikka loit automaation kesken halvan jakson.

- **Eve App -historiatuki**: Näet halvat ja kalliit jaksot kauniina graafina Eve-sovelluksessa (Fakegato-tuki).

##Kuinka plugin toimii HomeKitissä
Jotta vältytään vahinkopainalluksilta, laitteet näkyvät HomeKitissä Ovitunnistimina (Contact Sensor), joiden tilaa käyttäjä ei voi itse muuttaa.

##AUKI (Open) = Sähkö on HALPAA. Laita laitteet päälle.

##KIINNI (Closed) = Sähkö on KALLISTA. Laita laitteet pois päältä.

##Näin teet automaation Koti-sovelluksessa
1. Avaa Apple Koti -sovellus -> Automaatiot -> + -> Tunnistin havaitsee jotain.
2. Käynnistys-automaatio: Valitse luotu sensori (esim. Lämminvesivaraaja) -> Aukeaa -> Valitse ohjattava pistorasia -> Aseta päälle.
3. Sammutus-automaatio: Valitse sama sensori -> Sulkeutuu -> Valitse ohjattava pistorasia -> Aseta pois päältä.

##Asennus
Asenna Homebridge.

Etsi Homebridgen lisäosista homebridge-nordpool-cheapest-range tai asenna terminaalista: npm install -g homebridge-nordpool-cheapest-range

Määritä laitteet Homebridgen käyttöliittymän kautta tai muokkaamalla config.json -tiedostoa.
