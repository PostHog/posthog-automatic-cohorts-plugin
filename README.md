# Session Tracker Plugin

This plugin:

- Emits `session_started` events
- Adds a property `is_first_event_in_session` to the first event in a given session
- Emits `session_ended` events with a property `session_duration`

## Important Note For Self-Hosted Users

This plugin leverages database storage to work. We estimate that it will use about 3MB of storage for every 10000 users tracked.