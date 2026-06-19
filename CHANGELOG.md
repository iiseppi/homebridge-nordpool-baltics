# Changelog

All notable changes to this project will be documented in this file.

## [1.5.1]

### Fixed
- **Duplicate Startup Updates**: Removed duplicate startup status update to prevent repeated calculations, duplicate Fakegato history entries, and repeated log output during plugin or child bridge startup.
- **Fakegato Log Noise**: Routed normal Fakegato history logs to debug level while keeping real errors visible in normal logs.

### Changed
- **Startup Flow**: Initial accessory status updates are now handled centrally after prices are fetched and devices are discovered.

## [1.5.0]

### Fixed
- **Overnight Range Scheduling**: Fixed cheapest-hours calculation for overnight ranges such as 23:00–07:00.
- **Partial Price Data Handling**: Overnight schedules are now created only when all required prices are available.
- **New Accessory Behavior**: New accessories added during an active overnight range remain OFF until the next complete schedule can be calculated.
- **Midnight Schedule Handling**: Improved schedule handling across midnight to avoid incorrect same-day matching.

### Changed
- **Debug Logging**: Moved detailed schedule logs to debug level to reduce normal log noise.

## [1.4.0]

### Skipped
- Version skipped to align release numbering.

## [1.3.0]

### Fixed
- **Midnight Crossing Logic**: Fixed a critical bug in `calculateCheapestStatus` where time ranges crossing midnight (e.g., 23:00–07:00) failed to correctly identify next-day hours due to strict current-day matching. The plugin now accurately tracks hours into the following day.

### Changed
- **Enhanced Logging**: Improved the schedule logging format. Hours selected for the following day are now explicitly marked with a `(Next Day)` tag in the console log for better transparency and easier debugging.

## [1.0.0]

### Added
- Initial standalone release of `homebridge-nordpool-cheapest-range`.
- **Double Pulse Strategy**: Implemented hourly pulsing logic for both ON and OFF states to ensure HomeKit automations trigger reliably.
- **Hourly Cron Job**: Added automatic updates at the start of every hour with a 7-second offset for synchronization.
- **Boot Update**: Added immediate status update upon plugin startup to ensure HomeKit state consistency.
- **Fakegato-history**: Integrated Eve app history support for tracking cheap/expensive cycles.

### Fixed
- **NPM Automation**: Configured automation token support to bypass 2FA for CI/CD pipelines.

### Changed
- Updated documentation with professional badges and bilingual (EN/FI) instructions.
- Optimized API fetching schedule to run at 2 minutes past the hour to avoid server congestion.
