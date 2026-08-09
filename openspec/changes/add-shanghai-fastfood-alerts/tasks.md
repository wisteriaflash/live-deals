# Tasks: add-shanghai-fastfood-alerts

> 详细分步施工见同目录 [`plan.md`](./plan.md)（与 OpenSpec 变更合并维护，无需放到 `docs/superpowers/plans/`）。  
> 下面是变更级摘要；执行时以 `plan.md` 的 Task 1–10 为准。

## 1. Project bootstrap

- [ ] 1.1 Initialize Node.js 20+ TypeScript project (`src/`, `tests/`, `package.json`, `tsconfig.json`) — plan Task 1
- [ ] 1.2 Add `zod` config schema for city, brands, poll interval, push provider tokens, sources list — plan Task 2
- [ ] 1.3 Add SQLite schema bootstrap via `better-sqlite3` — plan Task 3
- [ ] 1.4 Add `.env.example` and ensure secrets are not committed — plan Task 2
- [ ] 1.5 Add local inbox HTTP server scaffold (`Hono` on `127.0.0.1`) — plan Task 9

## 2. Core pipeline

- [ ] 2.1 Brand whitelist filter and Shanghai city stamp — plan Task 4
- [ ] 2.2 Parser for title/brand/summary/url — plan Task 5
- [ ] 2.3 Fingerprint + dedupe window with force override — plan Task 4 / 7
- [ ] 2.4 Wire parse → dedupe → store → notify pipeline — plan Task 7

## 3. Collectors

- [ ] 3.1 Scheduler loop — plan Task 8
- [ ] 3.2 `meituan_poller` fixture-first — plan Task 8
- [ ] 3.3 Per-source failure isolation + maintenance alerts — plan Task 8
- [ ] 3.4 Inbox HTTP entrypoint — plan Task 9

## 4. Notifier

- [ ] 4.1 WxPusher default provider — plan Task 6
- [ ] 4.2 Message template — plan Task 6
- [ ] 4.3 Immediate retry + pending backlog — plan Task 7（pending 入库；scheduler 后续可扩展 flush）

## 5. Verification

- [ ] 5.1 Unit tests — plan Tasks 2–9
- [ ] 5.2 Parser fixtures — plan Task 5
- [ ] 5.3 Manual checklist — plan Task 10

## 6. Docs

- [ ] 6.1 README setup/compliance — plan Task 10
- [ ] 6.2 Owner forwards to group (manual) — plan Task 10
- [ ] 6.3 Future Android note — plan Task 10
