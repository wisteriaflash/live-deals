# Design: Shanghai Fast-Food Live Deal Alerts

## Architecture

本地常驻服务，四层：

1. **Source Registry** — 配置文件维护上海快餐相关美团直播/活动源
2. **Collectors** — `meituan_poller`（定时巡检）+ `inbox`（投喂）
3. **Filter & Store** — 品牌/关键词过滤、归一化、指纹去重、SQLite
4. **Notifier** — 仅推送到本人微信

```text
scheduler ──► meituan_poller ──┐
                               ├──► parser ──► deduper+store ──► notifier ──► 本人微信
you ──► inbox (link/text) ─────┘
```

## Components

| Component | Responsibility |
|-----------|----------------|
| `config` | 城市、品牌白名单、巡检间隔、推送 token、源清单 |
| `scheduler` | 按间隔触发巡检 |
| `meituan_poller` | 拉取公开页摘要；单源失败隔离 |
| `inbox` | 本地 HTTP 或 CLI 接收投喂 |
| `parser` | 抽取品牌、标题、力度/价格、链接 |
| `store` | SQLite：raw、规范化记录、已推送指纹 |
| `deduper` | 可配置窗口（默认 6–24h）内同指纹不重复推 |
| `notifier` | WxPusher/PushPlus/企微；失败重试与补推 |

## Data model (v1)

- `sources(id, url_or_id, brand_hint, status, fail_count, updated_at)`
- `raw_snapshots(id, source_id|inbox, payload, fetched_at)`
- `deals(id, fingerprint, brand, title, summary, url, city, origin, created_at)`
- `notifications(id, deal_id, status, attempts, last_error, sent_at)`

Fingerprint：归一化后的 `brand + title + url`（或标题关键 token 哈希），避免同券刷屏。

## Error handling

- 巡检超时/结构变化/限流：记日志，跳过该源；连续失败 N 次（默认 3）推送「源失效」维护提醒
- 解析失败：保留 raw，不推模糊结果；投喂路径回传「解析失败」提示
- 推送失败：重试 1 次；仍失败写入 `pending`，下次调度补推
- 需登录才能查看：标记 `needs_manual`，不撞登录墙
- 投喂可带 `force` 强制再推一次

## Tech choices

- **运行时 / 语言**：Node.js 20+ + TypeScript（轻量栈，非 NestJS）
- **包管理**：`pnpm` 或 `npm`（二选一，仓库内统一）
- **存储**：SQLite via `better-sqlite3`
- **配置**：`zod` 校验 + YAML 源清单；密钥用环境变量或本地 `.env`，不入库
- **调度**：`node-cron` 或进程内 `setInterval`（默认间隔 5–10 分钟）
- **投喂 HTTP**：`Hono` 或 `Fastify`，仅监听 `127.0.0.1`
- **HTTP 客户端**：原生 `fetch`；HTML 摘要解析可用 `cheerio`（fixture 优先）
- **推送**：默认 WxPusher；可选切换 PushPlus 或企微应用（配置项，同一时间只用一个）
- **测试**：`vitest`（或 `node:test`）+ 本地 HTML/文本 fixture；真网巡检作手动验收
- **模块边界**：采集 / 过滤去重 / 存储 / 通知拆开，便于以后抽共享 TS 包给安卓客户端

## Future Android (out of v1 scope)

- v1 不做安卓 App；产品形态仍是本机常驻 Node 服务 + 微信推送
- 预留本机 HTTP API（投喂、健康检查、可选历史列表），便于二期客户端接入
- 二期若做 App：优先 **Expo / React Native**，与现有 TypeScript 模型、白名单、文案模板部分复用
- **巡检逻辑仍放在常驻 Node 服务**（电脑或小主机）；手机端负责通知展示、投喂链接、查看历史，不承担不可靠的后台爬取

## Compliance boundary

- 只使用使用者有权访问的公开信息与本人账号推送通道
- 不实现验证码破解、设备伪装对抗、未授权接口爆破
- README 明确：页面改版可能导致巡检失效，需更新源或改用投喂

## Open questions (resolved in brainstorming)

- 渠道：美团直播（非抖音）
- 城市：上海
- 推送：本人微信 → 人工转发群
- 时效：数分钟～十几分钟可接受
- 策略：巡检为主 + 投喂兜底
- 技术栈：Node.js 20+ + TypeScript 轻量栈（替代原 Python 草案）
- 产品形态：本机服务（非网站）；安卓为二期
