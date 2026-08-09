# Delta for promo-pricing

## ADDED Requirements

### Requirement: Parse promo text into priced items
The system SHALL parse live title/subtitle style promo text into zero or more items with a product name and current price, and MAY extract an original/list price when present in the text.

#### Scenario: Subtitle with multiple priced offers
- GIVEN subtitle text like `圆筒冰淇淋2元！柠檬蛋奶冰淇淋3元！3份薯条19.9元！`
- WHEN the promo parser runs
- THEN it produces separate items including names and prices such as 2, 3, and 19.9

#### Scenario: Unparseable promo text
- GIVEN text with no recognizable price patterns
- WHEN the promo parser runs
- THEN it returns no items
- AND no discount notification is sent

### Requirement: Price baseline selection
For each parsed item, the system SHALL set baseline price as: (1) original/list price from text if available, else (2) the median of stored historical current prices for the normalized product name within `baselineWindowDays` (default 14).

#### Scenario: List price preferred
- GIVEN an item with current price 19.9 and list price 26.8 in text
- WHEN baseline is computed
- THEN baseline is 26.8

#### Scenario: Historical median when no list price
- GIVEN an item with only current price and at least one historical price sample in the window
- WHEN baseline is computed
- THEN baseline is the median of those historical prices

### Requirement: Record prices even when not notifying
The system SHALL persist observed current prices for parsed items regardless of whether a notification is sent, so future baselines can be computed.

#### Scenario: First sighting without baseline
- GIVEN a newly seen product name with no list price and no history
- WHEN the item is processed
- THEN the current price is stored
- AND no notification is sent

### Requirement: Discount gate before notify
The system SHALL notify only when `(baseline - price) >= minDiscountYuan` (default 3) OR `(baseline - price) / baseline >= minDiscountRatio` (default 0.10).

#### Scenario: Meets absolute threshold
- GIVEN baseline 26.8 and price 19.9
- WHEN the gate is evaluated
- THEN notification is allowed because savings ≥ 3 yuan

#### Scenario: Below both thresholds
- GIVEN baseline 20 and price 19
- WHEN the gate is evaluated
- THEN notification is not sent
- AND the price is still recorded
