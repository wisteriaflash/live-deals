# Proposal: Playwright Live Promo Polling with Discount Gate

## Intent

v1 已具备调度、去重、WxPusher 与 inbox，但对美团直播页的裸 `fetch` 只能拿到 SPA 空壳，无法支撑「自动巡检」主目标。本变更把直播采集升级为：**Playwright 打开配置的直播 URL，拦截 `livestudiobaseinfo` 等页面 JSON**，从标题/副标题解析优惠话术中的商品与现价；按划线价或历史价做基准，仅当降幅达到门槛时推送到本人微信，并写明比平时低多少。

## Scope

**In**

- `live_browser_poller`：Playwright（优先系统 Chrome）打开 `sources` 直播页并拦截直播详情 JSON
- `promo_text_parser`：从 `liveTitle` / `liveSubTitle`（及同类字段）解析「商品名 + 现价」，可选原价
- `price_baseline`：文案原价优先；否则商品名在窗口期内历史现价中位数（默认 14 天）
- `deal_gate`：`(baseline-price)≥¥3` 或 降幅`≥10%` 才允许通知
- 每次解析到的现价入库（含未推送），供历史基准
- 推送文案增加现价、基准、降额与降幅
- 保留 inbox 兜底；配置项：`minDiscountYuan`、`minDiscountRatio`、`baselineWindowDays`、`browserChannel`
- 探测结论写入设计约束：网页端无稳定 DOM 商品卡属预期

**Out**

- 官方/可购买的美团直播开放 API（不存在可用项）
- 硬编码破解 yoda/验证码/设备伪装
- 结构化货架卡、弹窗券抢购细节
- 独立 Worker 进程（仍同进程调度）
- 安卓客户端

## Approach

方案 2：以浏览器会话携带页面正常请求，截获私有 H5 JSON，避免裸调签名；解析话术级优惠后走现有 pipeline。无原价且无足够历史则只记价不推，减少误报。

## Impact

- 新增依赖：`playwright`；运行时需本机 Chrome 或已安装的 Chromium
- 巡检更重（浏览器），间隔可沿用或略增大
- 私有接口与选择器会变；失败走 `needs_manual` + 维护提醒 + inbox
