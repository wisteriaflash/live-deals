# Tasks: add-live-browser-promo-polling

## 1. Dependencies and config

- [ ] 1.1 Add `playwright` dependency; document system Chrome preference and install notes in README
- [ ] 1.2 Extend config schema: `minDiscountYuan`, `minDiscountRatio`, `baselineWindowDays`, `browserChannel`
- [ ] 1.3 Add SQLite table/columns for price history (normalized name, price, seen_at, source_id)

## 2. Promo parsing and gating

- [ ] 2.1 Implement `promo_text_parser` with fixtures from real subtitles
- [ ] 2.2 Implement `price_baseline` (list price then median history)
- [ ] 2.3 Implement `deal_gate` with ¥3 / 10% defaults and unit tests
- [ ] 2.4 Persist price observations even when gate fails or baseline missing

## 3. Browser poller

- [ ] 3.1 Implement Playwright poller with response interception for `livestudiobaseinfo` (and similar)
- [ ] 3.2 Route live URLs (`liveid=` / `business-live-broadcast`) to browser poller
- [ ] 3.3 Map capture failures to existing source failure / needs_manual / maintenance alert behavior
- [ ] 3.4 Keep inbox path unchanged as fallback

## 4. Notify and wire-up

- [ ] 4.1 Extend message template with baseline and savings fields
- [ ] 4.2 Wire scheduler → browser poller → parse → history → gate → existing notify pipeline
- [ ] 4.3 Integration test with saved JSON fixture (no live browser in CI)

## 5. Docs and manual verification

- [ ] 5.1 README: live polling limits, no official purchasable live-deal API, Chrome requirement
- [ ] 5.2 Manual checklist: poll configured live source; confirm WeChat shows 比平时低; inbox still works
