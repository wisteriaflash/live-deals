# filter-store Specification

## Purpose
TBD - created by archiving change add-shanghai-fastfood-alerts. Update Purpose after archive.
## Requirements
### Requirement: Parse deal fields
The system SHALL extract brand, title, short summary (price or discount strength when available), and canonical URL from poller or inbox input when those fields are present.

#### Scenario: Successful parse
- GIVEN raw content that includes brand keywords and a title
- WHEN the parser runs
- THEN a structured deal record is produced with brand, title, summary, and url

#### Scenario: Failed parse does not notify
- GIVEN raw content that cannot be confidently parsed
- WHEN the parser runs
- THEN no deal notification is sent
- AND the raw payload is retained for inspection
- AND inbox submissions receive a parse-failure acknowledgement when applicable

### Requirement: Fingerprint deduplication
The system SHALL compute a stable fingerprint from normalized brand, title, and URL (or title tokens when URL is missing) and SHALL suppress duplicate notifications within a configurable window (default 6–24 hours), unless force is requested.

#### Scenario: Duplicate within window
- GIVEN a deal fingerprint that was successfully notified 1 hour ago
- WHEN the same fingerprint is seen again without force
- THEN no new WeChat notification is sent

#### Scenario: Same deal after window expires
- GIVEN a deal fingerprint whose last successful notification is older than the dedupe window
- WHEN the fingerprint is seen again
- THEN a new notification MAY be sent

### Requirement: Persistent local store
The system SHALL persist sources status, raw snapshots, deals, and notification attempts in a local SQLite database.

#### Scenario: Restart retains fingerprints
- GIVEN deals and notifications already stored
- WHEN the service restarts
- THEN previously notified fingerprints remain effective for deduplication

