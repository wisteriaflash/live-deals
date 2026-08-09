# Tasks: add-live-browser-promo-polling

> 详细分步施工见同目录 [`plan.md`](./plan.md)（与 OpenSpec 变更合并维护）。  
> 下面是变更级摘要；执行时以 `plan.md` 的 Task 1–9 为准。

## 1. Dependencies and config

- [x] 1.1 Add `playwright` dependency; document system Chrome preference and install notes in README — plan Task 1 / 9
- [x] 1.2 Extend config schema: `minDiscountYuan`, `minDiscountRatio`, `baselineWindowDays`, `browserChannel` — plan Task 1
- [x] 1.3 Add SQLite table/columns for price history (normalized name, price, seen_at, source_id) — plan Task 2

## 2. Promo parsing and gating

- [x] 2.1 Implement `promo_text_parser` with fixtures from real subtitles — plan Task 3
- [x] 2.2 Implement `price_baseline` (list price then median history) — plan Task 4
- [x] 2.3 Implement `deal_gate` with ¥3 / 10% defaults and unit tests — plan Task 4
- [x] 2.4 Persist price observations even when gate fails or baseline missing — plan Task 2 / 6

## 3. Browser poller

- [x] 3.1 Implement Playwright poller with response interception for `livestudiobaseinfo` (and similar) — plan Task 7
- [x] 3.2 Route live URLs (`liveid=` / `business-live-broadcast`) to browser poller — plan Task 7 / 8
- [x] 3.3 Map capture failures to existing source failure / needs_manual / maintenance alert behavior — plan Task 8
- [x] 3.4 Keep inbox path unchanged as fallback — plan Task 8

## 4. Notify and wire-up

- [x] 4.1 Extend message template with baseline and savings fields — plan Task 5
- [x] 4.2 Wire scheduler → browser poller → parse → history → gate → existing notify pipeline — plan Task 6 / 8
- [x] 4.3 Integration test with saved JSON fixture (no live browser in CI) — plan Task 8

## 5. Docs and manual verification

- [x] 5.1 README: live polling limits, no official purchasable live-deal API, Chrome requirement — plan Task 9
- [x] 5.2 Manual checklist: poll configured live source; confirm WeChat shows 比平时低; inbox still works — plan Task 9
