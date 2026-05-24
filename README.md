# Homebridge Nordpool Cheapest Range

<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-wordmark-logo-transparent.png" width="300" alt="Homebridge Logo">
</p>

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
