# Delta for notifier

## ADDED Requirements

### Requirement: Owner-only WeChat delivery
The system SHALL send deal alerts only to the configured owner WeChat channel. The default provider SHALL be WxPusher; PushPlus or WeCom app message MAY be selected via configuration. The system SHALL NOT auto-post into group chats in v1.

#### Scenario: New deal notifies owner
- GIVEN a new deal that passes brand filter and dedupe
- WHEN notification is triggered
- THEN the owner WeChat channel receives a message containing brand, summary, link, and origin (`poll` or `inbox`)

### Requirement: Notification retry and backlog
The system SHALL retry a failed send once immediately, and if still failing, record a pending notification to be retried on a later schedule cycle.

#### Scenario: Transient push failure
- GIVEN the push provider returns a transient error on first attempt
- WHEN the immediate retry succeeds
- THEN the notification is marked sent
- AND the deal is treated as notified for dedupe

#### Scenario: Persistent push failure
- GIVEN both send attempts fail
- WHEN the poll/inbox cycle ends
- THEN a pending notification record remains
- AND a later cycle attempts to deliver it

### Requirement: Message content minimum
Each deal notification MUST include enough information for the owner to decide whether to forward: brand, title or summary, link when available, city (上海), and collection origin.

#### Scenario: Forward-ready copy
- GIVEN a notifiable deal with URL
- WHEN the message is composed
- THEN the body includes brand, summary/title, URL, 上海, and origin label
