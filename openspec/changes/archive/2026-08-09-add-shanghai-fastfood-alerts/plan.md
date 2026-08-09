# Shanghai Fast-Food Live Deal Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付本机 Node.js + TypeScript 常驻服务：巡检配置的美团公开源（上海快餐），去重后经 WxPusher 推到本人微信，并支持本地 HTTP 投喂兜底。

**Architecture:** 单进程服务。`scheduler` 定时调用 `meituan_poller`；`inbox`（Hono @ 127.0.0.1）接收人工链接；两者都走 `parser → filter → dedupe/store → notifier`。SQLite 持久化指纹与推送状态。不做安卓、不做群发。

**Tech Stack:** Node.js 20+, TypeScript, npm, zod, yaml, better-sqlite3, cheerio, Hono, vitest, WxPusher HTTP API

**Plan location (OpenSpec-merged):** 本文件与 `proposal.md` / `design.md` / `specs/` / `tasks.md` 同目录维护。`tasks.md` 为变更级勾选摘要；本 `plan.md` 为文件级施工步骤。不强制使用 `docs/superpowers/plans/`。

---

## File map

| Path | Responsibility |
|------|----------------|
| `package.json` | scripts: `dev`, `start`, `test`, `typecheck` |
| `tsconfig.json` | strict TypeScript |
| `vitest.config.ts` | test runner |
| `.env.example` | `WXPUSHER_APP_TOKEN`, `WXPUSHER_UID`, `DATABASE_PATH` |
| `.gitignore` | `node_modules`, `.env`, `data/*.db` |
| `config/default.yaml` | city, brands, pollIntervalMinutes, dedupeWindowHours, sources |
| `src/config.ts` | load YAML + env, zod validate |
| `src/db.ts` | open SQLite, migrate schema |
| `src/types.ts` | shared Deal / Source types |
| `src/filter.ts` | brand whitelist + city stamp |
| `src/fingerprint.ts` | normalize + hash |
| `src/parser.ts` | text/HTML → deal candidate |
| `src/store.ts` | insert raw/deal/notification, dedupe queries |
| `src/notify/wxpusher.ts` | WxPusher client |
| `src/notify/template.ts` | message body |
| `src/pipeline.ts` | parse→filter→dedupe→notify |
| `src/poller.ts` | fetch one source, isolate errors |
| `src/scheduler.ts` | interval loop + backlog flush |
| `src/inbox/server.ts` | Hono routes `/health`, `/inbox` |
| `src/index.ts` | boot: db, scheduler, http |
| `tests/fixtures/*.html` | saved public-page samples |
| `tests/*.test.ts` | unit tests |

---

### Task 1: Scaffold Node + TypeScript + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "meituan-live-deals",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `.gitignore` and stub `src/index.ts`**

```gitignore
node_modules/
dist/
.env
data/
*.db
.DS_Store
```

```ts
console.log("meituan-live-deals boot placeholder");
```

- [ ] **Step 5: Install deps**

Run:

```bash
npm install better-sqlite3 cheerio hono yaml zod
npm install -D typescript tsx vitest @types/node @types/better-sqlite3
```

Expected: `package-lock.json` created; no peer errors blocking install.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/index.ts
git commit -m "$(cat <<'EOF'
chore: scaffold Node TypeScript project

EOF
)"
```

---

### Task 2: Config schema (zod + YAML)

**Files:**
- Create: `config/default.yaml`, `src/config.ts`, `tests/config.test.ts`, `.env.example`

- [ ] **Step 1: Write failing test `tests/config.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import path from "node:path";

describe("loadConfig", () => {
  it("loads shanghai defaults and brands", () => {
    const cfg = loadConfig({
      configPath: path.join(process.cwd(), "config/default.yaml"),
      env: {
        WXPUSHER_APP_TOKEN: "token",
        WXPUSHER_UID: "uid",
        DATABASE_PATH: "./data/test.db",
      },
    });
    expect(cfg.city).toBe("上海");
    expect(cfg.brands).toContain("麦当劳");
    expect(cfg.brands).toContain("肯德基");
    expect(cfg.pollIntervalMinutes).toBeGreaterThanOrEqual(5);
    expect(cfg.wxpusher.appToken).toBe("token");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL (cannot find module `../src/config.js` or `loadConfig`)

- [ ] **Step 3: Add `config/default.yaml`**

```yaml
city: 上海
brands:
  - 麦当劳
  - 肯德基
  - 汉堡王
  - 必胜客
pollIntervalMinutes: 8
dedupeWindowHours: 12
failureAlertThreshold: 3
inboxHost: 127.0.0.1
inboxPort: 8787
sources:
  - id: example-mcd
    url: "https://example.invalid/meituan-live-mcd"
    brandHint: 麦当劳
    enabled: false
```

- [ ] **Step 4: Implement `src/config.ts`**

```ts
import fs from "node:fs";
import YAML from "yaml";
import { z } from "zod";

const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  brandHint: z.string().optional(),
  enabled: z.boolean().default(true),
});

const FileConfigSchema = z.object({
  city: z.literal("上海").default("上海"),
  brands: z.array(z.string().min(1)).min(1),
  pollIntervalMinutes: z.number().int().min(1).max(60).default(8),
  dedupeWindowHours: z.number().int().min(1).max(168).default(12),
  failureAlertThreshold: z.number().int().min(1).default(3),
  inboxHost: z.string().default("127.0.0.1"),
  inboxPort: z.number().int().default(8787),
  sources: z.array(SourceSchema).default([]),
});

export type AppConfig = z.infer<typeof FileConfigSchema> & {
  wxpusher: { appToken: string; uid: string };
  databasePath: string;
};

export function loadConfig(opts: {
  configPath: string;
  env: NodeJS.ProcessEnv;
}): AppConfig {
  const raw = YAML.parse(fs.readFileSync(opts.configPath, "utf8"));
  const file = FileConfigSchema.parse(raw);
  const appToken = opts.env.WXPUSHER_APP_TOKEN;
  const uid = opts.env.WXPUSHER_UID;
  if (!appToken || !uid) {
    throw new Error("WXPUSHER_APP_TOKEN and WXPUSHER_UID are required");
  }
  return {
    ...file,
    wxpusher: { appToken, uid },
    databasePath: opts.env.DATABASE_PATH ?? "./data/deals.db",
  };
}
```

- [ ] **Step 5: Add `.env.example`**

```env
WXPUSHER_APP_TOKEN=
WXPUSHER_UID=
DATABASE_PATH=./data/deals.db
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add config/default.yaml src/config.ts tests/config.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat: add zod-validated YAML config

EOF
)"
```

---

### Task 3: SQLite schema + store primitives

**Files:**
- Create: `src/db.ts`, `src/store.ts`, `src/types.ts`, `tests/store.test.ts`

- [ ] **Step 1: Write failing test `tests/store.test.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";

describe("DealStore", () => {
  let dbPath: string;
  let store: DealStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `deals-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("records notification and detects fingerprint inside window", () => {
    const deal = {
      fingerprint: "fp1",
      brand: "麦当劳",
      title: "麦辣鸡腿堡套餐",
      summary: "19.9",
      url: "https://example.com/a",
      city: "上海",
      origin: "inbox" as const,
    };
    const id = store.insertDeal(deal);
    store.markNotified(id, "sent");
    expect(store.wasNotifiedRecently("fp1", 12)).toBe(true);
    expect(store.wasNotifiedRecently("fp2", 12)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/store.test.ts`

- [ ] **Step 3: Implement `src/types.ts`**

```ts
export type DealOrigin = "poll" | "inbox";

export type DealInput = {
  fingerprint: string;
  brand: string;
  title: string;
  summary: string;
  url: string | null;
  city: string;
  origin: DealOrigin;
};

export type SourceConfig = {
  id: string;
  url: string;
  brandHint?: string;
  enabled: boolean;
};
```

- [ ] **Step 4: Implement `src/db.ts`**

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      brand TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      url TEXT,
      city TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TEXT,
      FOREIGN KEY(deal_id) REFERENCES deals(id)
    );
    CREATE TABLE IF NOT EXISTS source_status (
      source_id TEXT PRIMARY KEY,
      fail_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}
```

- [ ] **Step 5: Implement `src/store.ts`** (minimal methods used by test + later tasks)

```ts
import type Database from "better-sqlite3";
import type { DealInput } from "./types.js";

export class DealStore {
  constructor(private db: Database.Database) {}

  close() {
    this.db.close();
  }

  insertRaw(sourceId: string | null, payload: string): number {
    const info = this.db
      .prepare(
        `INSERT INTO raw_snapshots (source_id, payload, fetched_at) VALUES (?, ?, ?)`,
      )
      .run(sourceId, payload, new Date().toISOString());
    return Number(info.lastInsertRowid);
  }

  insertDeal(deal: DealInput): number {
    const info = this.db
      .prepare(
        `INSERT INTO deals (fingerprint, brand, title, summary, url, city, origin, created_at)
         VALUES (@fingerprint, @brand, @title, @summary, @url, @city, @origin, @created_at)`,
      )
      .run({ ...deal, created_at: new Date().toISOString() });
    return Number(info.lastInsertRowid);
  }

  markNotified(dealId: number, status: "sent" | "pending" | "failed", error?: string) {
    this.db
      .prepare(
        `INSERT INTO notifications (deal_id, status, attempts, last_error, sent_at)
         VALUES (?, ?, 1, ?, ?)`,
      )
      .run(
        dealId,
        status,
        error ?? null,
        status === "sent" ? new Date().toISOString() : null,
      );
  }

  wasNotifiedRecently(fingerprint: string, windowHours: number): boolean {
    const row = this.db
      .prepare(
        `SELECT n.sent_at as sent_at
         FROM deals d
         JOIN notifications n ON n.deal_id = d.id
         WHERE d.fingerprint = ? AND n.status = 'sent' AND n.sent_at IS NOT NULL
         ORDER BY n.sent_at DESC LIMIT 1`,
      )
      .get(fingerprint) as { sent_at: string } | undefined;
    if (!row) return false;
    const ageMs = Date.now() - new Date(row.sent_at).getTime();
    return ageMs < windowHours * 3600_000;
  }

  recordSourceSuccess(sourceId: string) {
    this.db
      .prepare(
        `INSERT INTO source_status (source_id, fail_count, last_error, updated_at)
         VALUES (?, 0, NULL, ?)
         ON CONFLICT(source_id) DO UPDATE SET fail_count=0, last_error=NULL, updated_at=excluded.updated_at`,
      )
      .run(sourceId, new Date().toISOString());
  }

  recordSourceFailure(sourceId: string, error: string): number {
    this.db
      .prepare(
        `INSERT INTO source_status (source_id, fail_count, last_error, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           fail_count = source_status.fail_count + 1,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(sourceId, error, new Date().toISOString());
    const row = this.db
      .prepare(`SELECT fail_count FROM source_status WHERE source_id = ?`)
      .get(sourceId) as { fail_count: number };
    return row.fail_count;
  }

  listPendingNotifications(): Array<{ notificationId: number; dealId: number }> {
    return this.db
      .prepare(
        `SELECT id as notificationId, deal_id as dealId FROM notifications WHERE status = 'pending'`,
      )
      .all() as Array<{ notificationId: number; dealId: number }>;
  }
}
```

- [ ] **Step 6: Run test — expect PASS**

Run: `npx vitest run tests/store.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/db.ts src/store.ts src/types.ts tests/store.test.ts
git commit -m "$(cat <<'EOF'
feat: add SQLite schema and deal store

EOF
)"
```

---

### Task 4: Brand filter + fingerprint

**Files:**
- Create: `src/filter.ts`, `src/fingerprint.ts`, `tests/filter.test.ts`, `tests/fingerprint.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/filter.test.ts
import { describe, expect, it } from "vitest";
import { matchBrand } from "../src/filter.js";

describe("matchBrand", () => {
  const brands = ["麦当劳", "肯德基", "汉堡王", "必胜客"];
  it("detects mcdonalds alias", () => {
    expect(matchBrand("麦当劳早餐券", brands)).toBe("麦当劳");
  });
  it("returns null for unknown", () => {
    expect(matchBrand("星巴克买一送一", brands)).toBeNull();
  });
});
```

```ts
// tests/fingerprint.test.ts
import { describe, expect, it } from "vitest";
import { dealFingerprint } from "../src/fingerprint.js";

describe("dealFingerprint", () => {
  it("is stable for same normalized inputs", () => {
    const a = dealFingerprint({
      brand: "麦当劳",
      title: " 麦辣鸡腿堡 套餐 ",
      url: "https://example.com/a",
    });
    const b = dealFingerprint({
      brand: "麦当劳",
      title: "麦辣鸡腿堡 套餐",
      url: "https://example.com/a",
    });
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/filter.test.ts tests/fingerprint.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/filter.ts
export function matchBrand(text: string, brands: string[]): string | null {
  for (const brand of brands) {
    if (text.includes(brand)) return brand;
  }
  return null;
}

export function withCity<T extends object>(value: T, city: string): T & { city: string } {
  return { ...value, city };
}
```

```ts
// src/fingerprint.ts
import { createHash } from "node:crypto";

export function dealFingerprint(input: {
  brand: string;
  title: string;
  url: string | null;
}): string {
  const title = input.title.replace(/\s+/g, " ").trim().toLowerCase();
  const url = (input.url ?? "").trim().toLowerCase();
  const raw = `${input.brand}|${title}|${url}`;
  return createHash("sha256").update(raw).digest("hex");
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/filter.ts src/fingerprint.ts tests/filter.test.ts tests/fingerprint.test.ts
git commit -m "$(cat <<'EOF'
feat: add brand filter and deal fingerprinting

EOF
)"
```

---

### Task 5: Parser (text + cheerio HTML fixture)

**Files:**
- Create: `src/parser.ts`, `tests/parser.test.ts`, `tests/fixtures/sample-deal.html`

- [ ] **Step 1: Fixture + failing test**

`tests/fixtures/sample-deal.html`:

```html
<html><body>
  <h1>麦当劳 双人成双套餐 39.9</h1>
  <a href="https://example.com/deal/mcd-39">查看详情</a>
</body></html>
```

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDealContent } from "../src/parser.js";

describe("parseDealContent", () => {
  it("parses html fixture", () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/sample-deal.html"),
      "utf8",
    );
    const parsed = parseDealContent({
      raw: html,
      brands: ["麦当劳", "肯德基"],
      fallbackUrl: null,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.brand).toBe("麦当劳");
    expect(parsed!.title).toContain("双人成双套餐");
    expect(parsed!.url).toContain("example.com/deal/mcd-39");
  });

  it("returns null when brand missing", () => {
    expect(
      parseDealContent({
        raw: "无关优惠",
        brands: ["麦当劳"],
        fallbackUrl: null,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/parser.ts`**

```ts
import * as cheerio from "cheerio";
import { matchBrand } from "./filter.js";

export type ParsedDeal = {
  brand: string;
  title: string;
  summary: string;
  url: string | null;
};

export function parseDealContent(opts: {
  raw: string;
  brands: string[];
  fallbackUrl: string | null;
}): ParsedDeal | null {
  const looksHtml = /<html|<body|<h1|<a\s/i.test(opts.raw);
  let title = opts.raw.trim();
  let url = opts.fallbackUrl;

  if (looksHtml) {
    const $ = cheerio.load(opts.raw);
    title = $("h1").first().text().trim() || $("title").text().trim() || title;
    const href = $("a[href]").first().attr("href");
    if (href) url = href;
  } else {
    const firstLine = opts.raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (firstLine) title = firstLine;
  }

  const brand = matchBrand(title, opts.brands) ?? matchBrand(opts.raw, opts.brands);
  if (!brand) return null;

  const price = title.match(/(\d+(?:\.\d+)?)\s*元?/);
  const summary = price ? price[1] : title.slice(0, 40);

  return { brand, title, summary, url };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts tests/parser.test.ts tests/fixtures/sample-deal.html
git commit -m "$(cat <<'EOF'
feat: parse deal title brand and url from text or html

EOF
)"
```

---

### Task 6: Notify template + WxPusher client

**Files:**
- Create: `src/notify/template.ts`, `src/notify/wxpusher.ts`, `tests/template.test.ts`

- [ ] **Step 1: Failing template test**

```ts
import { describe, expect, it } from "vitest";
import { formatDealMessage } from "../src/notify/template.js";

describe("formatDealMessage", () => {
  it("includes brand city origin and url", () => {
    const msg = formatDealMessage({
      brand: "肯德基",
      title: "疯狂星期四",
      summary: "29.9",
      url: "https://example.com/kfc",
      city: "上海",
      origin: "poll",
    });
    expect(msg).toContain("肯德基");
    expect(msg).toContain("上海");
    expect(msg).toContain("poll");
    expect(msg).toContain("https://example.com/kfc");
  });
});
```

- [ ] **Step 2: Implement template + client**

```ts
// src/notify/template.ts
import type { DealOrigin } from "../types.js";

export function formatDealMessage(input: {
  brand: string;
  title: string;
  summary: string;
  url: string | null;
  city: string;
  origin: DealOrigin;
}): string {
  return [
    `【${input.brand}】${input.title}`,
    `力度/摘要: ${input.summary}`,
    `城市: ${input.city}`,
    `来源: ${input.origin}`,
    input.url ? `链接: ${input.url}` : "链接: （无）",
  ].join("\n");
}

export function formatMaintenanceMessage(sourceId: string, failCount: number, error: string): string {
  return `源失效提醒: ${sourceId}\n连续失败: ${failCount}\n错误: ${error}\n请更新 config/default.yaml`;
}
```

```ts
// src/notify/wxpusher.ts
export async function sendWxPusher(opts: {
  appToken: string;
  uid: string;
  content: string;
  summary?: string;
}): Promise<void> {
  const res = await fetch("https://wxpusher.zjiecode.com/api/send/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appToken: opts.appToken,
      content: opts.content,
      summary: opts.summary ?? opts.content.slice(0, 20),
      contentType: 1,
      uids: [opts.uid],
    }),
  });
  if (!res.ok) {
    throw new Error(`WxPusher HTTP ${res.status}`);
  }
  const body = (await res.json()) as { success?: boolean; msg?: string };
  if (!body.success) {
    throw new Error(body.msg ?? "WxPusher send failed");
  }
}
```

- [ ] **Step 3: Run template test PASS**

- [ ] **Step 4: Commit**

```bash
git add src/notify/template.ts src/notify/wxpusher.ts tests/template.test.ts
git commit -m "$(cat <<'EOF'
feat: add WeChat message template and WxPusher client

EOF
)"
```

---

### Task 7: Pipeline (parse → filter → dedupe → notify)

**Files:**
- Create: `src/pipeline.ts`, `tests/pipeline.test.ts`

- [ ] **Step 1: Failing test with fake notifier**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { processRawDeal } from "../src/pipeline.js";

describe("processRawDeal", () => {
  let store: DealStore;
  let dbPath: string;
  const sent: string[] = [];

  beforeEach(() => {
    sent.length = 0;
    dbPath = path.join(os.tmpdir(), `pipe-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("notifies once then dedupes", async () => {
    const cfg = {
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
    };
    const notify = async (content: string) => {
      sent.push(content);
    };
    const raw = "麦当劳 早餐券 9.9\nhttps://example.com/mcd";
    await processRawDeal({
      store,
      raw,
      origin: "inbox",
      brands: cfg.brands,
      city: cfg.city,
      dedupeWindowHours: cfg.dedupeWindowHours,
      force: false,
      fallbackUrl: "https://example.com/mcd",
      notify,
    });
    await processRawDeal({
      store,
      raw,
      origin: "inbox",
      brands: cfg.brands,
      city: cfg.city,
      dedupeWindowHours: cfg.dedupeWindowHours,
      force: false,
      fallbackUrl: "https://example.com/mcd",
      notify,
    });
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement `src/pipeline.ts`**

```ts
import { dealFingerprint } from "./fingerprint.js";
import { parseDealContent } from "./parser.js";
import { formatDealMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { DealOrigin } from "./types.js";

export async function processRawDeal(opts: {
  store: DealStore;
  raw: string;
  origin: DealOrigin;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  force: boolean;
  fallbackUrl: string | null;
  sourceId?: string | null;
  notify: (content: string) => Promise<void>;
}): Promise<{ status: "notified" | "deduped" | "parse_failed" | "notify_failed"; dealId?: number }> {
  opts.store.insertRaw(opts.sourceId ?? null, opts.raw);
  const parsed = parseDealContent({
    raw: opts.raw,
    brands: opts.brands,
    fallbackUrl: opts.fallbackUrl,
  });
  if (!parsed) return { status: "parse_failed" };

  const fingerprint = dealFingerprint(parsed);
  if (!opts.force && opts.store.wasNotifiedRecently(fingerprint, opts.dedupeWindowHours)) {
    return { status: "deduped" };
  }

  const dealId = opts.store.insertDeal({
    fingerprint,
    brand: parsed.brand,
    title: parsed.title,
    summary: parsed.summary,
    url: parsed.url,
    city: opts.city,
    origin: opts.origin,
  });

  const content = formatDealMessage({
    ...parsed,
    city: opts.city,
    origin: opts.origin,
  });

  try {
    await opts.notify(content);
    opts.store.markNotified(dealId, "sent");
    return { status: "notified", dealId };
  } catch (err) {
    try {
      await opts.notify(content);
      opts.store.markNotified(dealId, "sent");
      return { status: "notified", dealId };
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      opts.store.markNotified(dealId, "pending", message);
      return { status: "notify_failed", dealId };
    }
  }
}
```

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/pipeline.ts tests/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat: wire parse filter dedupe notify pipeline

EOF
)"
```

---

### Task 8: Poller + scheduler + failure alerts

**Files:**
- Create: `src/poller.ts`, `src/scheduler.ts`, `tests/poller.test.ts`

- [ ] **Step 1: Poller test with mocked fetch**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { pollSource } from "../src/poller.js";

describe("pollSource", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `poll-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
    vi.unstubAllGlobals();
  });

  it("processes html from fetch", async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/sample-deal.html"),
      "utf8",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200 })),
    );
    const sent: string[] = [];
    await pollSource({
      source: {
        id: "example-mcd",
        url: "https://example.com/live",
        enabled: true,
        brandHint: "麦当劳",
      },
      store,
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      failureAlertThreshold: 3,
      notify: async (c) => {
        sent.push(c);
      },
    });
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Implement poller + scheduler**

```ts
// src/poller.ts
import { processRawDeal } from "./pipeline.js";
import { formatMaintenanceMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { SourceConfig } from "./types.js";

export async function pollSource(opts: {
  source: SourceConfig;
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  failureAlertThreshold: number;
  notify: (content: string) => Promise<void>;
}): Promise<void> {
  try {
    const res = await fetch(opts.source.url, {
      redirect: "follow",
      headers: { "user-agent": "meituan-live-deals/0.1 (+personal)" },
    });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`needs_manual HTTP ${res.status}`), {
        needsManual: true,
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    await processRawDeal({
      store: opts.store,
      raw,
      origin: "poll",
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      force: false,
      fallbackUrl: opts.source.url,
      sourceId: opts.source.id,
      notify: opts.notify,
    });
    opts.store.recordSourceSuccess(opts.source.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failCount = opts.store.recordSourceFailure(opts.source.id, message);
    if (failCount >= opts.failureAlertThreshold) {
      await opts.notify(
        formatMaintenanceMessage(opts.source.id, failCount, message),
      );
    }
  }
}
```

```ts
// src/scheduler.ts
import type { AppConfig } from "./config.js";
import type { DealStore } from "./store.js";
import { pollSource } from "./poller.js";
import { sendWxPusher } from "./notify/wxpusher.js";

export function startScheduler(opts: {
  config: AppConfig;
  store: DealStore;
}): { stop: () => void } {
  const notify = (content: string) =>
    sendWxPusher({
      appToken: opts.config.wxpusher.appToken,
      uid: opts.config.wxpusher.uid,
      content,
    });

  const tick = async () => {
    for (const source of opts.config.sources.filter((s) => s.enabled)) {
      await pollSource({
        source,
        store: opts.store,
        brands: opts.config.brands,
        city: opts.config.city,
        dedupeWindowHours: opts.config.dedupeWindowHours,
        failureAlertThreshold: opts.config.failureAlertThreshold,
        notify,
      });
    }
  };

  void tick();
  const timer = setInterval(
    () => void tick(),
    opts.config.pollIntervalMinutes * 60_000,
  );
  return { stop: () => clearInterval(timer) };
}
```

- [ ] **Step 3: Run poller test PASS**

- [ ] **Step 4: Commit**

```bash
git add src/poller.ts src/scheduler.ts tests/poller.test.ts
git commit -m "$(cat <<'EOF'
feat: add source poller and interval scheduler

EOF
)"
```

---

### Task 9: Inbox HTTP (Hono) + process boot

**Files:**
- Create: `src/inbox/server.ts`
- Modify: `src/index.ts`
- Create: `tests/inbox.test.ts`

- [ ] **Step 1: Inbox handler test (app.request)**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { createInboxApp } from "../src/inbox/server.js";

describe("inbox app", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `inbox-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("accepts link payload", async () => {
    const sent: string[] = [];
    const app = createInboxApp({
      store,
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      notify: async (c) => {
        sent.push(c);
      },
    });
    const res = await app.request("/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "麦当劳 午餐券",
        url: "https://example.com/mcd2",
        force: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("notified");
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement server + index**

```ts
// src/inbox/server.ts
import { Hono } from "hono";
import { processRawDeal } from "../pipeline.js";
import type { DealStore } from "../store.js";

export function createInboxApp(opts: {
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  notify: (content: string) => Promise<void>;
}) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/inbox", async (c) => {
    const body = await c.req.json<{
      text?: string;
      url?: string;
      force?: boolean;
    }>();
    const raw = [body.text, body.url].filter(Boolean).join("\n");
    if (!raw.trim()) return c.json({ error: "text or url required" }, 400);
    const result = await processRawDeal({
      store: opts.store,
      raw,
      origin: "inbox",
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      force: Boolean(body.force),
      fallbackUrl: body.url ?? null,
      notify: opts.notify,
    });
    if (result.status === "parse_failed") {
      return c.json({ status: result.status, message: "解析失败，请补品牌/标题" }, 422);
    }
    return c.json(result);
  });
  return app;
}
```

```ts
// src/index.ts
import path from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { DealStore } from "./store.js";
import { startScheduler } from "./scheduler.js";
import { createInboxApp } from "./inbox/server.js";
import { sendWxPusher } from "./notify/wxpusher.js";

async function main() {
  const config = loadConfig({
    configPath: path.join(process.cwd(), "config/default.yaml"),
    env: process.env,
  });
  const store = new DealStore(openDb(config.databasePath));
  const notify = (content: string) =>
    sendWxPusher({
      appToken: config.wxpusher.appToken,
      uid: config.wxpusher.uid,
      content,
    });

  const app = createInboxApp({
    store,
    brands: config.brands,
    city: config.city,
    dedupeWindowHours: config.dedupeWindowHours,
    notify,
  });

  serve({ fetch: app.fetch, hostname: config.inboxHost, port: config.inboxPort });
  startScheduler({ config, store });
  console.log(
    `listening on http://${config.inboxHost}:${config.inboxPort} ; polling every ${config.pollIntervalMinutes}m`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Install Hono Node adapter if needed**

Run: `npm install @hono/node-server`

- [ ] **Step 4: Run inbox test PASS**

- [ ] **Step 5: Commit**

```bash
git add src/inbox/server.ts src/index.ts tests/inbox.test.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: add local inbox HTTP API and process entrypoint

EOF
)"
```

---

### Task 10: README + manual verification notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand README** with setup, WxPusher, adding sources, compliance, forward-to-group, future Android note (polling stays on Node).

- [ ] **Step 2: Manual checklist (do not automate)**

1. 填 `.env`，`npm start`
2. `curl -X POST http://127.0.0.1:8787/inbox -H 'content-type: application/json' -d '{"text":"麦当劳 测试券","url":"https://example.com/x"}'` → 微信收到
3. 启用一个真实公开源做一次巡检（或暂时用本地 fixture URL）
4. 故意写坏源 URL，连续失败后收到维护提醒

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document setup compliance and manual verification

EOF
)"
```

---

## Spec coverage self-check

| Spec area | Tasks |
|-----------|-------|
| source-registry (config sources, city, brands) | Task 2 |
| collectors (poll, inbox, failure alert, public-only) | Task 8, 9 |
| filter-store (parse, fingerprint, sqlite) | Task 3–5, 7 |
| notifier (WxPusher, retry, template) | Task 6–7 |
| Node/TS stack + future Android note | Task 1, 10 |

## Placeholder scan

无 TBD；真实美团 DOM 选择器以 fixture 先通，上线后再按公开页微调 `parser.ts` / `poller.ts`（属验收期改动，不阻塞骨架）。
