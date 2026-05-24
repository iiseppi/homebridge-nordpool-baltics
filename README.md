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

---

## How It Works in HomeKit

To prevent accidental manual toggles by users, this plugin exposes devices as **Contact Sensors** (Door/Window sensors).

- **OPEN (Contact Not Detected)** = Electricity is CHEAP. Turn your appliances ON.
- **CLOSED (Contact Detected)** = Electricity is EXPENSIVE. Turn your appliances OFF.

---

## Example Automation Setup

1. Open the Apple Home app → **Automations** → **+** → **A Sensor Detects Something**.
2. **Turn ON Automation:** Select your Cheapest Range sensor → *Opens* → Select your appliance (e.g., Water Heater) → Turn ON.
3. **Turn OFF Automation:** Select your Cheapest Range sensor → *Closes* → Select your appliance → Turn OFF.

---

## Installation

1. Install Homebridge.
2. Install this plugin:

```bash
npm install -g homebridge-nordpool-cheapest-range
```

3. Configure the plugin through the Homebridge UI or update your `config.json`.

---

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

---

# 🇫🇮 Suomenkieliset ohjeet

Automatisoi raskaat kodinkoneet Nordpoolin halvimpien tuntien aikana valitsemasi aikaikkunan sisällä.

Tämä Homebridge-liitännäinen luo HomeKitiin virtuaalisia **Ovitunnistimia (Contact Sensor)**. Tunnistin “aukeaa”, kun sähkö on halvimmillaan määrittämäsi aikajakson sisällä. Tämän avulla voit ohjata esimerkiksi lämminvesivaraajaa, sähköauton laturia tai lämpöpumppua juuri silloin, kun sähkö on edullisinta.

---

## Ominaisuudet

- **Mukautettavat aikaikkunat**  
  Määritä, milloin laitteesi saa olla käynnissä (esim. vain klo 20:00–08:00 välillä).

- **Halvimmat tunnit**  
  Valitse, kuinka monta tuntia laitteen tulee olla päällä kyseisen aikaikkunan sisällä (esim. 3 halvinta tuntia).

- **“Kaksoispulssi”-varmistus (Double Pulse)**  
  HomeKit-automaatiot saattavat joskus jättää reagoimatta pitkään jatkuviin tiloihin. Tämä lisäosa käyttää erityistä kaksoispulssitekniikkaa: sensori vaihtaa tilaansa hetkellisesti joka tasatunti varmistaakseen, että automaatiot laukeavat luotettavasti — myös silloin, jos automaatio luodaan kesken aktiivisen halvan jakson.

- **Eve App -historiatuki**  
  Täysi Fakegato-historiatuki. Voit tarkastella halpojen ja kalliiden tuntien historiaa kauniina graafeina Eve-sovelluksessa.

- **Aurinkosähkö-ohitus (Solar Override)**  
  Tukee aurinkopaneeliohjausta, jos ominaisuus on määritetty käyttöön.

---

## Kuinka lisäosa toimii HomeKitissä

Jotta käyttäjät eivät voi vahingossa vaihtaa laitteen tilaa käsin, lisäosa näyttää laitteet HomeKitissä **Ovitunnistimina (Contact Sensor)**.

- **AUKI (Open / Contact Not Detected)** = Sähkö on HALPAA → käynnistä laitteet
- **KIINNI (Closed / Contact Detected)** = Sähkö on KALLISTA → sammuta laitteet

---

## Esimerkki automaation luomisesta Koti-sovelluksessa

1. Avaa Apple Koti -sovellus → **Automaatiot** → **+** → **Tunnistin havaitsee jotain**.
2. **Käynnistysautomaatio:**  
   Valitse Cheapest Range -sensori → **Aukeaa** → Valitse ohjattava laite (esim. lämminvesivaraaja) → **Laita päälle**.
3. **Sammutusautomaatio:**  
   Valitse sama sensori → **Sulkeutuu** → Valitse ohjattava laite → **Laita pois päältä**.

---

## Asennus

1. Asenna Homebridge.
2. Asenna tämä lisäosa:

```bash
npm install -g homebridge-nordpool-cheapest-range
```

3. Määritä lisäosa Homebridgen käyttöliittymässä tai muokkaamalla `config.json`-tiedostoa.

---

## Esimerkkikonfiguraatio

```json
{
  "platforms": [
    {
      "platform": "NordpoolCheapestRange",
      "devices": [
        {
          "name": "Lämminvesivaraaja",
          "cheapestHours": 3,
          "rangeStart": 22,
          "rangeEnd": 7
        },
        {
          "name": "Sähköauton laturi",
          "cheapestHours": 5,
          "rangeStart": 0,
          "rangeEnd": 23
        }
      ]
    }
  ]
}
```
