# Delta for notifier

## MODIFIED Requirements

### Requirement: Message content minimum
Each discount notification from live promo polling MUST include brand (when known), product name, current price, baseline price, absolute savings, savings percentage, city when applicable, origin, and live URL when available.

#### Scenario: Discount message shows savings
- GIVEN a gated live promo item ready to notify
- WHEN the message is composed
- THEN the body includes 现价, 基准, and 比平时低 with both yuan and percent
