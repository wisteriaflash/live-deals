# Design: Playwright Live Promo Polling with Discount Gate

## Context (probe findings)

对本机 `liveid=15483849` 的探测表明：

- 裸 HTML 无商品文案；DOM 商品卡为空
- Playwright + 系统 Chrome 可打开页面
- `mlive.meituan.com/.../livestudiobaseinfo.bin` 返回 `liveTitle` / `liveSubTitle`，含真实优惠话术与价格
- 美团无面向个人可购买的「直播优惠开放 API」；该接口为页面私有能力

因此本设计以 **拦截页面 JSON + 文案解析** 为主，不以 DOM 货架卡为准。

## Architecture

```text
scheduler
  └─ live_browser_poller (Playwright)
        open source URL
        intercept livestudiobaseinfo (and similar) JSON
        → promo_text_parser
        → record price history
        → price_baseline
        → deal_gate (≥¥3 or ≥10%)
        → existing pipeline / store / notifier

inbox (fallback) ─────────────────────────────┘
```

Replace v1 bare `fetch` path for live sources with the browser poller. Non-live/static sources may keep fetch if still useful; live URLs use browser path (config flag or URL heuristic: `liveid=` / `business-live-broadcast`).

## Components

| Component | Responsibility |
|-----------|----------------|
| `live_browser_poller` | Launch Playwright (`channel: chrome` preferred), navigate, wait, capture matching JSON responses; per-source isolation |
| `promo_text_parser` | Split title/subtitle into `{ name, price, listPrice? }[]` |
| `price_baseline` | Prefer parsed list/original price; else median of stored prices for normalized name in `baselineWindowDays` |
| `deal_gate` | Notify only if absolute discount ≥ `minDiscountYuan` OR ratio ≥ `minDiscountRatio` |
| `price_history` store | Persist observed prices even when not notifying |
| Existing modules | Reuse dedupe fingerprint, WxPusher template (extended), inbox, failure alerts |

## Baseline and gate rules

1. If promo text includes an original/list price for the item → baseline = that price  
2. Else baseline = median of historical `price` for the same normalized product name within `baselineWindowDays` (default 14)  
3. If no baseline available → **record price, do not notify**  
4. Notify iff `(baseline - price) >= minDiscountYuan` (default 3) **OR** `(baseline - price) / baseline >= minDiscountRatio` (default 0.10)  
5. Message MUST include current price, baseline, absolute savings, and percentage

## Notification copy

```text
【{brand}】{productName}
现价: {price}  基准: {baseline}
比平时低: ¥{saveYuan}（约 {saveRatio}%）
来源: poll / 直播
链接: {liveUrl}
```

## Config additions

```yaml
minDiscountYuan: 3
minDiscountRatio: 0.10
baselineWindowDays: 14
browserChannel: chrome   # or chromium
```

## Error handling

- Browser/navigation/timeout / no live JSON → source failure; threshold → maintenance alert; `needs_manual`
- JSON present but parse yields no items → keep raw; do not mark as discount success
- Below gate → store history only
- Notify failures → existing retry + pending flush
- No captcha bypass, no anti-bot arms race

## Testing

- Unit: parser fixtures from real subtitle strings; gate boundary cases; baseline median/list-price precedence  
- Integration: recorded `livestudiobaseinfo` JSON fixture through parse → gate → message (no live browser required in CI)  
- Manual: one real live source on developer machine with Chrome installed  

## Compliance

- Personal use; low frequency; no redistribution of scraped feeds as a product  
- Private H5 APIs are unsupported and may break; document inbox fallback  
- No purchase path for official live-deal APIs identified as of design date
