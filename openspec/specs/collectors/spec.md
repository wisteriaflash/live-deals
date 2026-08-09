# collectors Specification

## Purpose
TBD - created by archiving change add-shanghai-fastfood-alerts. Update Purpose after archive.
## Requirements
### Requirement: Scheduled public-source polling
The system SHALL periodically fetch publicly visible summaries for each enabled source at a configurable interval (default between 5 and 10 minutes).

#### Scenario: Poll cycle completes per source
- GIVEN enabled sources A and B
- WHEN a poll cycle runs
- THEN the poller attempts to fetch A and B independently
- AND a failure on A does not skip B

### Requirement: Public-only fetch boundary
The system SHALL NOT attempt to bypass login walls, CAPTCHAs, or anti-bot challenges. If content requires login or cannot be parsed from the public response, the system SHALL mark the result as needing manual inbox follow-up.

#### Scenario: Login-gated content
- GIVEN a source response that indicates login is required
- WHEN parsing is attempted
- THEN no WeChat deal notification is sent for that opaque content
- AND the source or snapshot is marked `needs_manual`

### Requirement: Manual inbox fallback
The system SHALL accept owner-submitted Meituan links or plain text via a local inbox entrypoint (HTTP endpoint and/or CLI) and process them through the same parse → dedupe → notify pipeline as polled items.

#### Scenario: Owner submits a deal link
- GIVEN a valid inbox submission containing a Meituan URL and optional title text
- WHEN the inbox handler processes it
- THEN a deal candidate is parsed and evaluated for notification

#### Scenario: Force re-notify
- GIVEN an inbox submission with a force flag
- WHEN the deal fingerprint was recently notified
- THEN the system still sends a WeChat notification once

### Requirement: Source failure maintenance alert
The system SHALL track consecutive fetch failures per source and notify the owner when a configurable threshold (default 3) is reached so the source list can be updated.

#### Scenario: Three consecutive failures
- GIVEN source S has failed on two consecutive poll cycles
- WHEN the third consecutive failure occurs
- THEN the owner receives a maintenance alert naming source S
- AND routine deal notifications are not fabricated from the failed fetch

