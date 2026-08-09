# Delta for collectors

## ADDED Requirements

### Requirement: Browser live poller with JSON interception
The system SHALL poll live sources by opening the configured live URL in Playwright (preferring the system Chrome channel when available) and capturing live-detail JSON responses such as `livestudiobaseinfo`, rather than relying on bare HTML fetch alone for live pages.

#### Scenario: Successful capture of live promo fields
- GIVEN an enabled live source URL that loads in the browser
- WHEN the poller runs
- THEN it captures JSON containing live title and/or subtitle promo text when the page requests them
- AND passes that text into the promo parser pipeline

#### Scenario: No live JSON captured
- GIVEN a live source navigation that times out or yields no matching JSON
- WHEN the poll cycle finishes for that source
- THEN the source is recorded as failed / needs_manual
- AND no fabricated discount notification is sent

### Requirement: Live URL uses browser path
Sources whose URL indicates a Meituan live detail page (for example containing `business-live-broadcast` or `liveid=`) SHALL use the browser poller path.

#### Scenario: Live source routed to browser poller
- GIVEN a source URL containing `liveid=`
- WHEN scheduling a poll
- THEN the browser live poller is used instead of bare fetch

## MODIFIED Requirements

### Requirement: Scheduled public-source polling
The system SHALL continue to poll enabled sources on a configurable interval. For live sources, a successful poll means promo text was obtained via browser-intercepted JSON (or an explicitly allowed equivalent), not merely HTTP 200 HTML shell.

#### Scenario: SPA shell alone is not success
- GIVEN a live page returns HTML without usable promo fields and no intercepted live JSON
- WHEN evaluating poll success
- THEN the poll SHALL NOT be treated as a successful promo capture
