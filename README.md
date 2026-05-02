homebridge-nordpool-cheapest-range

This Homebridge plugin allows you to automate your home based on the cheapest electricity hours within a customized time range. It is perfect for optimizing high-energy appliances like car chargers, floor heating, or water heaters.

Credits
This plugin is based on the awesome work of msegzda and his project [homebridge-nordpool-baltics](https://github.com/msegzda/homebridge-nordpool-baltics). A huge thank you to him for creating the original foundation and logic! 
If you want to support this plugin, donate to msegzda! 

Key Features
Custom Time Windows: Find the cheapest hours specifically within a daily range (e.g., only between 00:00 and 07:00).

Eve App History: Full support for historical graphs in the Eve Home app. See exactly when your devices were in "Cheap" mode.

Detailed Logging: Transparent logs showing the exact selected hours and their prices for the current window.

Contact Sensor Interface: Exposed as a virtual Contact Sensor for easy automation in the Apple Home app.

How to Install
Set up your Homebridge environment.

Install the plugin via the Homebridge UI or using:

Bash
npm install homebridge-nordpool-cheapest-range
Configuration

You can configure multiple devices. Each device will appear as a Contact Sensor in HomeKit:

Name: Name of the sensor (e.g., "Water Heater Control").

Range Start: The hour when the calculation window begins (e.g., 0 for midnight).

Range End: The hour when the calculation window ends (e.g., 7 for 7 AM).

Target Cheapest Hours: How many hours within that range should the sensor be active.

Important Note: 
To ensure maximum reliability with the Nordpool API data resets, it is highly recommended to set your range within a single day (e.g., 0 to 7). Ranges crossing midnight (e.g., 23 to 06) may behave inconsistently during the midnight hour when price data for the previous day is cleared.
