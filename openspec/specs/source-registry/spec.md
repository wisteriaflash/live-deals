# source-registry Specification

## Purpose
TBD - created by archiving change add-shanghai-fastfood-alerts. Update Purpose after archive.
## Requirements
### Requirement: Configurable source list
The system SHALL load a curated list of Meituan live/activity sources from local configuration, each with a stable id, URL or room/activity identifier, and optional brand hint.

#### Scenario: Load sources on startup
- GIVEN a valid sources config file with one or more entries
- WHEN the service starts
- THEN all enabled sources are available to the poller

#### Scenario: Disable a source without deleting it
- GIVEN a source marked disabled in config
- WHEN a poll cycle runs
- THEN that source is not fetched

### Requirement: Shanghai city scope
The system SHALL treat Shanghai as the default and only city scope for v1 filtering and messaging copy.

#### Scenario: City stamped on deals
- GIVEN a newly parsed deal from polling or inbox
- WHEN it is stored
- THEN its city field is `上海`

### Requirement: Brand whitelist
The system SHALL only accept deals whose brand matches a configurable whitelist that includes at least 麦当劳, 肯德基, 汉堡王, and 必胜客.

#### Scenario: Non-whitelist brand dropped
- GIVEN a parsed item whose brand is outside the whitelist
- WHEN filtering runs
- THEN the item is not notified
- AND it may be stored as rejected/ignored for debugging

