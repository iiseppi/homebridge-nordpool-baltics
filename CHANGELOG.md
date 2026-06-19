# Changelog

## 1.5.0

- Fixed overnight cheapest-hours scheduling for ranges such as 23:00–07:00.
- Overnight schedules are now created only when all required prices are available.
- New accessories added during an active overnight range remain OFF until the next complete schedule can be calculated.
- Improved schedule handling across midnight.
- Moved detailed schedule logs to debug level.
