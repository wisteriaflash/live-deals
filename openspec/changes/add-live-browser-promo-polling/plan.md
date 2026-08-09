# Live Browser Promo Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Playwright（优先系统 Chrome）打开配置的美团直播 URL，拦截 `livestudiobaseinfo` 等 JSON，解析优惠话术中的商品与现价；按划线价或 14 天历史中位数做基准，仅当降幅 ≥¥3 或 ≥10% 时推送到本人微信，并写明比平时低多少。

**Architecture:** 在现有单进程调度上，直播源走 `live_browser_poller` → `promo_text_parser` → 记价 → `price_baseline` → `deal_gate` → 扩展后的 notify；非直播源仍用裸 `fetch`；inbox 不变。无基准则只记价不推。

**Tech Stack:** 现有 Node 20 + TypeScript + vitest + SQLite；新增 `playwright`（`channel: "chrome"` 优先）。

**Plan location (OpenSpec-merged):** 本文件与 `proposal.md` / `design.md` / `specs/` / `tasks.md` 同目录。`tasks.md` 为变更级勾选摘要；本 `plan.md` 为文件级施工步骤。

---

## File map

| Path | Responsibility |
|------|----------------|
| `package.json` | 增加 `playwright` 依赖 |
| `config/default.yaml` | `minDiscountYuan` / `minDiscountRatio` / `baselineWindowDays` / `browserChannel` |
| `src/config.ts` | zod 扩展上述字段 |
| `src/types.ts` | `PromoItem`、`DiscountNotifyInput`、`BrowserChannel` |
| `src/db.ts` | `price_history` 表 |
| `src/store.ts` | `insertPriceObservation` / `listPricesForName` |
| `src/promo_text_parser.ts` | 从 title/subtitle 解析商品+现价(+可选原价) |
| `src/price_baseline.ts` | 原价优先，否则窗口内中位数 |
| `src/deal_gate.ts` | ¥3 / 10% 门槛 |
| `src/live_url.ts` | 判断是否直播 URL |
| `src/live_browser_poller.ts` | Playwright 打开页并拦截 JSON |
| `src/live_pipeline.ts` | 解析→记价→基准→门槛→去重通知 |
| `src/poller.ts` | 非直播源继续 fetch；导出失败处理可复用 |
| `src/scheduler.ts` | 按 URL 分流 live vs fetch；传入新配置 |
| `src/notify/template.ts` | `formatDiscountMessage`（现价/基准/比平时低） |
| `tests/fixtures/livestudiobaseinfo.json` | CI 用拦截 JSON |
| `tests/fixtures/promo-subtitles.txt` | 可选；主夹具在测试内联亦可 |
| `tests/*.test.ts` | 单测 + 无浏览器集成测 |
| `README.md` | Chrome、无官方可购 API、直播限制说明 |

---

### Task 1: Playwright 依赖与配置字段

**Files:**
- Modify: `package.json`, `config/default.yaml`, `src/config.ts`, `tests/config.test.ts`
- Modify: `README.md`（安装说明可先加短段落，Task 9 再补完整）

- [ ] **Step 1: 扩展失败测试 `tests/config.test.ts`**

在现有 `loads shanghai defaults and brands` 中追加断言：

```ts
expect(cfg.minDiscountYuan).toBe(3);
expect(cfg.minDiscountRatio).toBe(0.1);
expect(cfg.baselineWindowDays).toBe(14);
expect(cfg.browserChannel).toBe("chrome");
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL（字段不存在 / undefined）

- [ ] **Step 3: 更新 `config/default.yaml`**

在 `failureAlertThreshold` 附近加入：

```yaml
minDiscountYuan: 3
minDiscountRatio: 0.10
baselineWindowDays: 14
browserChannel: chrome
```

- [ ] **Step 4: 更新 `src/config.ts` 的 zod schema**

在 `FileConfigSchema` 中增加：

```ts
minDiscountYuan: z.number().min(0).default(3),
minDiscountRatio: z.number().min(0).max(1).default(0.1),
baselineWindowDays: z.number().int().min(1).max(90).default(14),
browserChannel: z.enum(["chrome", "chromium"]).default("chrome"),
```

- [ ] **Step 5: 安装 playwright**

Run:

```bash
npm install playwright
```

Expected: `package-lock.json` 更新；不要求 CI 下载浏览器二进制（运行时用系统 Chrome `channel: "chrome"`）。

在 README「环境准备」加一句：

```markdown
- 直播巡检需要本机已安装 **Google Chrome**（Playwright `channel: chrome`）。也可把 `browserChannel` 设为 `chromium` 并执行 `npx playwright install chromium`。
```

- [ ] **Step 6: 跑测通过并提交**

```bash
npm test -- tests/config.test.ts
```

Expected: PASS

```bash
git add package.json package-lock.json config/default.yaml src/config.ts tests/config.test.ts README.md
git commit -m "$(cat <<'EOF'
feat: add discount gate config and playwright dependency

EOF
)"
```

---

### Task 2: price_history 表与 store API

**Files:**
- Modify: `src/db.ts`, `src/store.ts`
- Create: `tests/price_history.test.ts`

- [ ] **Step 1: 写失败测试 `tests/price_history.test.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";

describe("price history", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ph-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("stores observations and lists by normalized name within window", () => {
    store.insertPriceObservation({
      normalizedName: "三份薯条",
      price: 26.8,
      sourceId: "mcd-welfare-live",
      seenAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    });
    store.insertPriceObservation({
      normalizedName: "三份薯条",
      price: 19.9,
      sourceId: "mcd-welfare-live",
      seenAt: new Date().toISOString(),
    });
    const prices = store.listPricesForName("三份薯条", 14);
    expect(prices).toEqual([26.8, 19.9]);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

```bash
npm test -- tests/price_history.test.ts
```

Expected: FAIL（方法不存在）

- [ ] **Step 3: 在 `src/db.ts` 的 `db.exec` 中追加表**

```sql
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL,
  price REAL NOT NULL,
  source_id TEXT,
  seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_history_name_seen
  ON price_history (normalized_name, seen_at);
```

- [ ] **Step 4: 在 `src/store.ts` 增加方法**

```ts
insertPriceObservation(input: {
  normalizedName: string;
  price: number;
  sourceId: string | null;
  seenAt?: string;
}): number {
  const info = this.db
    .prepare(
      `INSERT INTO price_history (normalized_name, price, source_id, seen_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.normalizedName,
      input.price,
      input.sourceId,
      input.seenAt ?? new Date().toISOString(),
    );
  return Number(info.lastInsertRowid);
}

listPricesForName(normalizedName: string, windowDays: number): number[] {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const rows = this.db
    .prepare(
      `SELECT price FROM price_history
       WHERE normalized_name = ? AND seen_at >= ?
       ORDER BY seen_at ASC`,
    )
    .all(normalizedName, since) as Array<{ price: number }>;
  return rows.map((r) => r.price);
}
```

- [ ] **Step 5: 跑测通过并提交**

```bash
npm test -- tests/price_history.test.ts
git add src/db.ts src/store.ts tests/price_history.test.ts
git commit -m "$(cat <<'EOF'
feat: persist observed promo prices for baseline history

EOF
)"
```

---

### Task 3: promo_text_parser

**Files:**
- Create: `src/promo_text_parser.ts`, `src/types.ts`（或扩展）、`tests/promo_text_parser.test.ts`

- [ ] **Step 1: 在 `src/types.ts` 增加类型**

```ts
export type PromoItem = {
  name: string;
  price: number;
  listPrice?: number;
};

export type BrowserChannel = "chrome" | "chromium";
```

- [ ] **Step 2: 写失败测试 `tests/promo_text_parser.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parsePromoText, normalizeProductName } from "../src/promo_text_parser.js";

describe("parsePromoText", () => {
  it("splits multiple priced offers from subtitle", () => {
    const items = parsePromoText(
      "圆筒冰淇淋2元！柠檬蛋奶冰淇淋3元！3份薯条19.9元！",
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining("圆筒冰淇淋"), price: 2 }),
        expect.objectContaining({ name: expect.stringContaining("柠檬蛋奶冰淇淋"), price: 3 }),
        expect.objectContaining({ name: expect.stringContaining("薯条"), price: 19.9 }),
      ]),
    );
    expect(items).toHaveLength(3);
  });

  it("extracts list price when present", () => {
    const items = parsePromoText("3份薯条19.9元（原价26.8元）");
    expect(items[0]?.price).toBe(19.9);
    expect(items[0]?.listPrice).toBe(26.8);
  });

  it("returns empty for unparseable text", () => {
    expect(parsePromoText("今晚福利多多敬请期待")).toEqual([]);
  });
});

describe("normalizeProductName", () => {
  it("strips spaces and lowercases for history key", () => {
    expect(normalizeProductName(" 3份 薯条 ")).toBe("3份薯条");
  });
});
```

- [ ] **Step 3: 跑测确认失败**

```bash
npm test -- tests/promo_text_parser.test.ts
```

Expected: FAIL

- [ ] **Step 4: 实现 `src/promo_text_parser.ts`**

```ts
import type { PromoItem } from "./types.js";

export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, "").trim().toLowerCase();
}

/**
 * Heuristic parser for Meituan live title/subtitle promo copy.
 * Patterns covered:
 * - `名称19.9元` / `名称2元`
 * - optional `（原价26.8元）` / `(原价26.8)` after the deal price
 * Split on `！` `!` `；` `;` `。` and newlines first.
 */
export function parsePromoText(...parts: Array<string | null | undefined>): PromoItem[] {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return [];

  const chunks = text
    .split(/[！!;；。\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: PromoItem[] = [];
  const priceRe =
    /^(.*?)(\d+(?:\.\d+)?)\s*元?(?:\s*[（(]\s*原价\s*(\d+(?:\.\d+)?)\s*元?\s*[）)])?\s*$/u;

  for (const chunk of chunks) {
    const m = chunk.match(priceRe);
    if (!m) continue;
    const name = m[1].replace(/[:：\s]+$/u, "").trim();
    const price = Number(m[2]);
    if (!name || !Number.isFinite(price)) continue;
    const listPrice = m[3] !== undefined ? Number(m[3]) : undefined;
    const item: PromoItem = { name, price };
    if (listPrice !== undefined && Number.isFinite(listPrice)) {
      item.listPrice = listPrice;
    }
    items.push(item);
  }
  return items;
}
```

- [ ] **Step 5: 跑测通过并提交**

```bash
npm test -- tests/promo_text_parser.test.ts
git add src/types.ts src/promo_text_parser.ts tests/promo_text_parser.test.ts
git commit -m "$(cat <<'EOF'
feat: parse live promo subtitle into priced items

EOF
)"
```

---

### Task 4: price_baseline + deal_gate

**Files:**
- Create: `src/price_baseline.ts`, `src/deal_gate.ts`
- Create: `tests/price_baseline.test.ts`, `tests/deal_gate.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/price_baseline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveBaseline, median } from "../src/price_baseline.js";

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("resolveBaseline", () => {
  it("prefers list price", () => {
    expect(
      resolveBaseline({ listPrice: 26.8, historicalPrices: [30, 28] }),
    ).toBe(26.8);
  });

  it("uses historical median when no list price", () => {
    expect(
      resolveBaseline({ historicalPrices: [20, 22, 30] }),
    ).toBe(22);
  });

  it("returns null when neither available", () => {
    expect(resolveBaseline({ historicalPrices: [] })).toBeNull();
  });
});
```

`tests/deal_gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateDiscountGate } from "../src/deal_gate.js";

describe("evaluateDiscountGate", () => {
  it("allows when absolute savings >= 3", () => {
    const r = evaluateDiscountGate({
      price: 19.9,
      baseline: 26.8,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(true);
    expect(r.saveYuan).toBeCloseTo(6.9, 5);
    expect(r.saveRatio).toBeGreaterThan(0.1);
  });

  it("allows when ratio >= 10% even if yuan < 3", () => {
    const r = evaluateDiscountGate({
      price: 9,
      baseline: 10,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(true);
    expect(r.saveYuan).toBe(1);
    expect(r.saveRatio).toBeCloseTo(0.1, 5);
  });

  it("rejects when below both thresholds", () => {
    const r = evaluateDiscountGate({
      price: 19,
      baseline: 20,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

```bash
npm test -- tests/price_baseline.test.ts tests/deal_gate.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 `src/price_baseline.ts`**

```ts
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function resolveBaseline(opts: {
  listPrice?: number;
  historicalPrices: number[];
}): number | null {
  if (opts.listPrice !== undefined && Number.isFinite(opts.listPrice) && opts.listPrice > 0) {
    return opts.listPrice;
  }
  return median(opts.historicalPrices.filter((p) => Number.isFinite(p) && p > 0));
}
```

- [ ] **Step 4: 实现 `src/deal_gate.ts`**

```ts
export function evaluateDiscountGate(opts: {
  price: number;
  baseline: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
}): { ok: boolean; saveYuan: number; saveRatio: number } {
  const saveYuan = opts.baseline - opts.price;
  const saveRatio = opts.baseline > 0 ? saveYuan / opts.baseline : 0;
  const ok =
    saveYuan >= opts.minDiscountYuan || saveRatio >= opts.minDiscountRatio;
  return { ok, saveYuan, saveRatio };
}
```

- [ ] **Step 5: 跑测通过并提交**

```bash
npm test -- tests/price_baseline.test.ts tests/deal_gate.test.ts
git add src/price_baseline.ts src/deal_gate.ts tests/price_baseline.test.ts tests/deal_gate.test.ts
git commit -m "$(cat <<'EOF'
feat: add price baseline and discount gate

EOF
)"
```

---

### Task 5: 折扣推送文案

**Files:**
- Modify: `src/notify/template.ts`, `tests/template.test.ts`
- Modify: `src/types.ts`（可选 `DiscountNotifyInput`）

- [ ] **Step 1: 扩展失败测试 `tests/template.test.ts`**

```ts
import { formatDiscountMessage } from "../src/notify/template.js";

it("includes current price baseline and savings", () => {
  const msg = formatDiscountMessage({
    brand: "麦当劳",
    productName: "3份薯条",
    price: 19.9,
    baseline: 26.8,
    saveYuan: 6.9,
    saveRatio: 6.9 / 26.8,
    city: "上海",
    origin: "poll",
    url: "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
  });
  expect(msg).toContain("现价");
  expect(msg).toContain("19.9");
  expect(msg).toContain("基准");
  expect(msg).toContain("26.8");
  expect(msg).toContain("比平时低");
  expect(msg).toContain("poll");
  expect(msg).toContain("liveid=15483849");
});
```

保留原有 `formatDealMessage` 测试（inbox 仍用旧模板）。

- [ ] **Step 2: 跑测确认失败后实现**

```ts
export function formatDiscountMessage(input: {
  brand: string;
  productName: string;
  price: number;
  baseline: number;
  saveYuan: number;
  saveRatio: number;
  city: string;
  origin: DealOrigin;
  url: string | null;
}): string {
  const pct = Math.round(input.saveRatio * 1000) / 10; // one decimal percent
  const yuan = Math.round(input.saveYuan * 100) / 100;
  return [
    `【${input.brand}】${input.productName}`,
    `现价: ${input.price}  基准: ${input.baseline}`,
    `比平时低: ¥${yuan}（约 ${pct}%）`,
    `城市: ${input.city}`,
    `来源: ${input.origin} / 直播`,
    input.url ? `链接: ${input.url}` : "链接: （无）",
  ].join("\n");
}
```

- [ ] **Step 3: 提交**

```bash
npm test -- tests/template.test.ts
git add src/notify/template.ts tests/template.test.ts
git commit -m "$(cat <<'EOF'
feat: show baseline and savings in discount messages

EOF
)"
```

---

### Task 6: live_pipeline（记价 → 门槛 → 通知）

**Files:**
- Create: `src/live_pipeline.ts`, `tests/live_pipeline.test.ts`

- [ ] **Step 1: 写失败测试 `tests/live_pipeline.test.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { processLivePromoCapture } from "../src/live_pipeline.js";

describe("processLivePromoCapture", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `lp-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("records price and skips notify when no baseline", async () => {
    const sent: string[] = [];
    const result = await processLivePromoCapture({
      store,
      liveTitle: "麦当劳福利",
      liveSubTitle: "圆筒冰淇淋2元！",
      liveUrl: "https://example.com/live?liveid=1",
      sourceId: "mcd",
      brandHint: "麦当劳",
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      baselineWindowDays: 14,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
      notify: async (c) => {
        sent.push(c);
      },
    });
    expect(sent).toHaveLength(0);
    expect(store.listPricesForName("圆筒冰淇淋", 14)).toEqual([2]);
    expect(result.notified).toBe(0);
    expect(result.recorded).toBe(1);
  });

  it("notifies when list price yields enough discount", async () => {
    const sent: string[] = [];
    const result = await processLivePromoCapture({
      store,
      liveTitle: "",
      liveSubTitle: "3份薯条19.9元（原价26.8元）",
      liveUrl: "https://example.com/live?liveid=1",
      sourceId: "mcd",
      brandHint: "麦当劳",
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      baselineWindowDays: 14,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
      notify: async (c) => {
        sent.push(c);
      },
    });
    expect(result.notified).toBe(1);
    expect(sent[0]).toContain("比平时低");
    expect(sent[0]).toContain("19.9");
    expect(store.listPricesForName("3份薯条", 14)).toEqual([19.9]);
  });

  it("records but does not notify when below gate", async () => {
    const sent: string[] = [];
    await processLivePromoCapture({
      store,
      liveTitle: "",
      liveSubTitle: "小食19元（原价20元）",
      liveUrl: "https://example.com/live?liveid=1",
      sourceId: "mcd",
      brandHint: "麦当劳",
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      baselineWindowDays: 14,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
      notify: async (c) => {
        sent.push(c);
      },
    });
    expect(sent).toHaveLength(0);
    expect(store.listPricesForName("小食", 14)).toEqual([19]);
  });
});
```

- [ ] **Step 2: 跑测确认失败后实现 `src/live_pipeline.ts`**

```ts
import { dealFingerprint } from "./fingerprint.js";
import { evaluateDiscountGate } from "./deal_gate.js";
import { formatDiscountMessage } from "./notify/template.js";
import { normalizeProductName, parsePromoText } from "./promo_text_parser.js";
import { resolveBaseline } from "./price_baseline.js";
import type { DealStore } from "./store.js";

export async function processLivePromoCapture(opts: {
  store: DealStore;
  liveTitle: string;
  liveSubTitle: string;
  liveUrl: string;
  sourceId: string;
  brandHint?: string;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  baselineWindowDays: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
  notify: (content: string) => Promise<void>;
}): Promise<{ recorded: number; notified: number; parseEmpty: boolean }> {
  const rawPayload = JSON.stringify({
    liveTitle: opts.liveTitle,
    liveSubTitle: opts.liveSubTitle,
  });
  opts.store.insertRaw(opts.sourceId, rawPayload);

  const items = parsePromoText(opts.liveTitle, opts.liveSubTitle);
  if (items.length === 0) {
    return { recorded: 0, notified: 0, parseEmpty: true };
  }

  const brand =
    opts.brandHint && opts.brands.includes(opts.brandHint)
      ? opts.brandHint
      : opts.brands.find((b) => `${opts.liveTitle}${opts.liveSubTitle}`.includes(b)) ??
        opts.brandHint ??
        opts.brands[0]!;

  let recorded = 0;
  let notified = 0;

  for (const item of items) {
    const normalizedName = normalizeProductName(item.name);
    // History for baseline excludes the observation we are about to insert.
    const historical = opts.store.listPricesForName(
      normalizedName,
      opts.baselineWindowDays,
    );
    opts.store.insertPriceObservation({
      normalizedName,
      price: item.price,
      sourceId: opts.sourceId,
    });
    recorded += 1;

    const baseline = resolveBaseline({
      listPrice: item.listPrice,
      historicalPrices: historical,
    });
    if (baseline === null) continue;

    const gate = evaluateDiscountGate({
      price: item.price,
      baseline,
      minDiscountYuan: opts.minDiscountYuan,
      minDiscountRatio: opts.minDiscountRatio,
    });
    if (!gate.ok) continue;

    const title = item.name;
    const summary = `现价${item.price}/基准${baseline}`;
    const fingerprint = dealFingerprint({
      brand,
      title,
      url: opts.liveUrl,
    });
    if (opts.store.wasNotifiedRecently(fingerprint, opts.dedupeWindowHours)) {
      continue;
    }

    const dealId = opts.store.insertDeal({
      fingerprint,
      brand,
      title,
      summary,
      url: opts.liveUrl,
      city: opts.city,
      origin: "poll",
    });

    const content = formatDiscountMessage({
      brand,
      productName: item.name,
      price: item.price,
      baseline,
      saveYuan: gate.saveYuan,
      saveRatio: gate.saveRatio,
      city: opts.city,
      origin: "poll",
      url: opts.liveUrl,
    });

    try {
      await opts.notify(content);
      opts.store.markNotified(dealId, "sent");
      notified += 1;
    } catch {
      try {
        await opts.notify(content);
        opts.store.markNotified(dealId, "sent");
        notified += 1;
      } catch (err2) {
        const message = err2 instanceof Error ? err2.message : String(err2);
        opts.store.markNotified(dealId, "pending", message);
      }
    }
  }

  return { recorded, notified, parseEmpty: false };
}
```

注意：`listPricesForName` **先取历史再 insert**，避免当前价进入中位数（首见无历史时正确返回 null）。

- [ ] **Step 3: 提交**

```bash
npm test -- tests/live_pipeline.test.ts
git add src/live_pipeline.ts tests/live_pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat: wire live promo capture through history gate and notify

EOF
)"
```

---

### Task 7: live_url 分流 + live_browser_poller

**Files:**
- Create: `src/live_url.ts`, `src/live_browser_poller.ts`
- Create: `tests/live_url.test.ts`
- Create: `tests/fixtures/livestudiobaseinfo.json`
- Create: `tests/live_browser_extract.test.ts`（纯函数提取，不启浏览器）

- [ ] **Step 1: `tests/live_url.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isMeituanLiveUrl } from "../src/live_url.js";

describe("isMeituanLiveUrl", () => {
  it("detects liveid and business-live-broadcast", () => {
    expect(
      isMeituanLiveUrl(
        "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
      ),
    ).toBe(true);
    expect(isMeituanLiveUrl("https://example.com/promo")).toBe(false);
  });
});
```

实现：

```ts
export function isMeituanLiveUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("liveid=") || u.includes("business-live-broadcast");
}
```

- [ ] **Step 2: fixture + 提取函数测试**

`tests/fixtures/livestudiobaseinfo.json`:

```json
{
  "data": {
    "liveTitle": "麦当劳福利直播",
    "liveSubTitle": "圆筒冰淇淋2元！柠檬蛋奶冰淇淋3元！3份薯条19.9元（原价26.8元）！"
  }
}
```

`tests/live_browser_extract.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractLivePromoFields, isLiveStudioInfoUrl } from "../src/live_browser_poller.js";

describe("live browser extract helpers", () => {
  it("matches livestudiobaseinfo urls", () => {
    expect(
      isLiveStudioInfoUrl(
        "https://mlive.meituan.com/live/livestudiobaseinfo.bin?liveid=1",
      ),
    ).toBe(true);
    expect(isLiveStudioInfoUrl("https://example.com/other")).toBe(false);
  });

  it("extracts title fields from fixture json", () => {
    const json = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/livestudiobaseinfo.json"),
        "utf8",
      ),
    );
    const fields = extractLivePromoFields(json);
    expect(fields.liveTitle).toContain("麦当劳");
    expect(fields.liveSubTitle).toContain("薯条");
  });
});
```

- [ ] **Step 3: 实现 `src/live_browser_poller.ts`**

```ts
import { chromium, type Browser } from "playwright";
import type { BrowserChannel } from "./types.js";

export function isLiveStudioInfoUrl(url: string): boolean {
  return /livestudiobaseinfo/i.test(url);
}

export function extractLivePromoFields(json: unknown): {
  liveTitle: string;
  liveSubTitle: string;
} {
  const root = json as Record<string, unknown> | null;
  const data =
    root && typeof root === "object" && root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root && typeof root === "object"
        ? root
        : {};
  const liveTitle = String(data?.liveTitle ?? data?.title ?? "");
  const liveSubTitle = String(
    data?.liveSubTitle ?? data?.subTitle ?? data?.subtitle ?? "",
  );
  return { liveTitle, liveSubTitle };
}

export type LiveCaptureResult = {
  liveTitle: string;
  liveSubTitle: string;
  rawJson: string;
};

export async function captureLivePromo(opts: {
  url: string;
  browserChannel: BrowserChannel;
  timeoutMs?: number;
}): Promise<LiveCaptureResult> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      channel: opts.browserChannel === "chrome" ? "chrome" : undefined,
      headless: true,
    });
    const page = await browser.newPage();
    let captured: LiveCaptureResult | null = null;

    page.on("response", async (response) => {
      try {
        if (!isLiveStudioInfoUrl(response.url())) return;
        if (captured) return;
        const json = await response.json();
        const fields = extractLivePromoFields(json);
        if (!fields.liveTitle && !fields.liveSubTitle) return;
        captured = {
          ...fields,
          rawJson: JSON.stringify(json),
        };
      } catch {
        // ignore non-json / aborted
      }
    });

    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (!captured && Date.now() < deadline) {
      await page.waitForTimeout(250);
    }
    if (!captured) {
      throw Object.assign(new Error("needs_manual no livestudiobaseinfo json"), {
        needsManual: true,
      });
    }
    return captured;
  } finally {
    await browser?.close();
  }
}
```

说明：`waitForTimeout` 若在所用 Playwright 版本弃用，改用 `await new Promise((r) => setTimeout(r, 250))`。

- [ ] **Step 4: 提交（本 Task 可不在 CI 启真实浏览器）**

```bash
npm test -- tests/live_url.test.ts tests/live_browser_extract.test.ts
git add src/live_url.ts src/live_browser_poller.ts tests/live_url.test.ts tests/live_browser_extract.test.ts tests/fixtures/livestudiobaseinfo.json
git commit -m "$(cat <<'EOF'
feat: add live url detection and browser JSON extract helpers

EOF
)"
```

---

### Task 8: scheduler 分流 + 失败映射 + 集成夹具

**Files:**
- Modify: `src/scheduler.ts`, `src/poller.ts`（可选抽出 `handleSourceError`）
- Create: `src/live_poller.ts`（包装 capture + pipeline + 失败计数）
- Create: `tests/live_poller.test.ts`（mock `captureLivePromo`）
- Create: `tests/live_integration.test.ts`（fixture → extract → pipeline，无浏览器）

- [ ] **Step 1: 实现 `src/live_poller.ts`**

```ts
import { captureLivePromo } from "./live_browser_poller.js";
import { processLivePromoCapture } from "./live_pipeline.js";
import { formatMaintenanceMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { BrowserChannel, SourceConfig } from "./types.js";

export async function pollLiveSource(opts: {
  source: SourceConfig;
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  failureAlertThreshold: number;
  baselineWindowDays: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
  browserChannel: BrowserChannel;
  notify: (content: string) => Promise<void>;
  capture?: typeof captureLivePromo;
}): Promise<void> {
  const captureFn = opts.capture ?? captureLivePromo;
  try {
    const captured = await captureFn({
      url: opts.source.url,
      browserChannel: opts.browserChannel,
    });
    const result = await processLivePromoCapture({
      store: opts.store,
      liveTitle: captured.liveTitle,
      liveSubTitle: captured.liveSubTitle,
      liveUrl: opts.source.url,
      sourceId: opts.source.id,
      brandHint: opts.source.brandHint,
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      baselineWindowDays: opts.baselineWindowDays,
      minDiscountYuan: opts.minDiscountYuan,
      minDiscountRatio: opts.minDiscountRatio,
      notify: opts.notify,
    });
    if (result.parseEmpty) {
      throw Object.assign(new Error("needs_manual promo parse empty"), {
        needsManual: true,
      });
    }
    opts.store.recordSourceSuccess(opts.source.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failCount = opts.store.recordSourceFailure(opts.source.id, message);
    if (failCount === opts.failureAlertThreshold) {
      await opts.notify(
        formatMaintenanceMessage(opts.source.id, failCount, message),
      );
    }
  }
}
```

- [ ] **Step 2: 修改 `src/scheduler.ts` 分流**

```ts
import { isMeituanLiveUrl } from "./live_url.js";
import { pollLiveSource } from "./live_poller.js";
import { pollSource } from "./poller.js";

// inside tick(), replace the pollSource-only loop:
for (const source of opts.config.sources.filter((s) => s.enabled)) {
  if (isMeituanLiveUrl(source.url)) {
    await pollLiveSource({
      source,
      store: opts.store,
      brands: opts.config.brands,
      city: opts.config.city,
      dedupeWindowHours: opts.config.dedupeWindowHours,
      failureAlertThreshold: opts.config.failureAlertThreshold,
      baselineWindowDays: opts.config.baselineWindowDays,
      minDiscountYuan: opts.config.minDiscountYuan,
      minDiscountRatio: opts.config.minDiscountRatio,
      browserChannel: opts.config.browserChannel,
      notify,
    });
  } else {
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
}
```

inbox / `flushPending`：pending 折扣消息若已用 `formatDiscountMessage` 写入 `deals.summary`，flush 仍用 `formatDealMessage` 即可（摘要里已含现价/基准）；**不要**为了 flush 改 inbox。规格要求 inbox 路径不变。

- [ ] **Step 3: `tests/live_poller.test.ts`（注入 mock capture）**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { pollLiveSource } from "../src/live_poller.js";

describe("pollLiveSource", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `pls-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("notifies from mocked capture with list price", async () => {
    const sent: string[] = [];
    await pollLiveSource({
      source: {
        id: "mcd-welfare-live",
        url: "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
        brandHint: "麦当劳",
        enabled: true,
      },
      store,
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      failureAlertThreshold: 3,
      baselineWindowDays: 14,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
      browserChannel: "chrome",
      notify: async (c) => {
        sent.push(c);
      },
      capture: async () => ({
        liveTitle: "麦当劳福利直播",
        liveSubTitle: "3份薯条19.9元（原价26.8元）",
        rawJson: "{}",
      }),
    });
    expect(sent.some((m) => m.includes("比平时低"))).toBe(true);
  });

  it("records failure when capture throws needs_manual", async () => {
    const sent: string[] = [];
    for (let i = 0; i < 3; i++) {
      await pollLiveSource({
        source: {
          id: "mcd-welfare-live",
          url: "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
          brandHint: "麦当劳",
          enabled: true,
        },
        store,
        brands: ["麦当劳"],
        city: "上海",
        dedupeWindowHours: 12,
        failureAlertThreshold: 3,
        baselineWindowDays: 14,
        minDiscountYuan: 3,
        minDiscountRatio: 0.1,
        browserChannel: "chrome",
        notify: async (c) => {
          sent.push(c);
        },
        capture: async () => {
          throw Object.assign(new Error("needs_manual no json"), {
            needsManual: true,
          });
        },
      });
    }
    expect(sent.some((m) => m.includes("源失效提醒"))).toBe(true);
  });
});
```

- [ ] **Step 4: `tests/live_integration.test.ts`（fixture 全链路，无浏览器）**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { DealStore } from "../src/store.js";
import { extractLivePromoFields } from "../src/live_browser_poller.js";
import { processLivePromoCapture } from "../src/live_pipeline.js";

describe("live fixture integration", () => {
  let store: DealStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `li-${Date.now()}.db`);
    store = new DealStore(openDb(dbPath));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dbPath, { force: true });
  });

  it("runs extract → pipeline from saved JSON", async () => {
    const json = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/livestudiobaseinfo.json"),
        "utf8",
      ),
    );
    const fields = extractLivePromoFields(json);
    const sent: string[] = [];
    const result = await processLivePromoCapture({
      store,
      ...fields,
      liveUrl:
        "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
      sourceId: "mcd-welfare-live",
      brandHint: "麦当劳",
      brands: ["麦当劳"],
      city: "上海",
      dedupeWindowHours: 12,
      baselineWindowDays: 14,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
      notify: async (c) => {
        sent.push(c);
      },
    });
    expect(result.recorded).toBeGreaterThanOrEqual(3);
    expect(sent.some((m) => m.includes("薯条") && m.includes("比平时低"))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 5: 全量测试并提交**

```bash
npm test
git add src/live_poller.ts src/scheduler.ts tests/live_poller.test.ts tests/live_integration.test.ts
git commit -m "$(cat <<'EOF'
feat: route live sources through playwright capture pipeline

EOF
)"
```

---

### Task 9: README 与手动验收

**Files:**
- Modify: `README.md`
- Modify: `openspec/changes/add-live-browser-promo-polling/tasks.md`（实现完成后勾选）

- [ ] **Step 1: README 补充**

在「合规与限制」或新小节「直播巡检」加入：

```markdown
## 直播巡检（Playwright）

- 含 `liveid=` / `business-live-broadcast` 的源会用本机 Chrome 打开页面，拦截 `livestudiobaseinfo` 类 JSON，从标题/副标题解析优惠话术。
- **没有面向个人可购买的美团直播优惠开放 API**；拦截的是页面私有 H5 能力，随时可能变更。
- DOM 商品卡为空属预期；话术解析不到价格时只记原始快照，不伪造优惠推送。
- 需本机 Google Chrome；或 `browserChannel: chromium` + `npx playwright install chromium`。
- inbox（`POST /inbox`）仍是兜底，行为与 v1 相同。

### 折扣门槛（可配置）

| 字段 | 默认 | 含义 |
|------|------|------|
| `minDiscountYuan` | 3 | 绝对降价（元） |
| `minDiscountRatio` | 0.10 | 相对降幅 |
| `baselineWindowDays` | 14 | 无原价时用历史现价中位数窗口 |
| `browserChannel` | chrome | Playwright 浏览器通道 |
```

手动验收清单追加：

```markdown
5. 启用真实直播源（已有 `mcd-welfare-live`），确认本机 Chrome 可用后 `npm start`，等待一轮巡检 → 若话术含「原价」且降幅达标，微信应出现「比平时低」
6. 同一商品短时间重复巡检 → 去重窗口内不应重复推送
7. `curl` inbox 仍可投喂并收到旧格式/通用推送
```

- [ ] **Step 2: 本地手测（开发者机器，不进 CI）**

```bash
npm start
# 观察日志是否打开 Chrome、是否捕获 JSON
# 检查微信推送文案是否含 现价 / 基准 / 比平时低
curl -s http://127.0.0.1:8787/health
```

- [ ] **Step 3: 勾选 `tasks.md` 对应项并提交文档**

```bash
git add README.md openspec/changes/add-live-browser-promo-polling/tasks.md
git commit -m "$(cat <<'EOF'
docs: document live browser polling limits and verification

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Browser poller + livestudiobaseinfo intercept | 7, 8 |
| No JSON → needs_manual / failure / no fake notify | 7, 8 |
| Live URL → browser path | 7, 8 (`isMeituanLiveUrl`) |
| SPA shell alone ≠ success | 7（无 JSON 抛错）、8 |
| Parse subtitle into priced items | 3 |
| Baseline: list price then median | 4, 6 |
| Record prices even when not notifying | 2, 6 |
| Gate ¥3 / 10% | 4, 6 |
| Message 现价/基准/比平时低 | 5, 6 |
| Config fields | 1 |
| Inbox unchanged | 8（不改 inbox） |
| Integration fixture without live browser | 8 |
| README Chrome / no official API | 9 |

## Type / name consistency

- `PromoItem`: `{ name, price, listPrice? }`
- `normalizeProductName` / `parsePromoText` — `promo_text_parser.ts`
- `resolveBaseline` / `median` — `price_baseline.ts`
- `evaluateDiscountGate` — `deal_gate.ts`
- `processLivePromoCapture` — `live_pipeline.ts`
- `captureLivePromo` / `extractLivePromoFields` / `isLiveStudioInfoUrl` — `live_browser_poller.ts`
- `pollLiveSource` — `live_poller.ts`
- `isMeituanLiveUrl` — `live_url.ts`
- Config: `minDiscountYuan`, `minDiscountRatio`, `baselineWindowDays`, `browserChannel`
- Store: `insertPriceObservation`, `listPricesForName`
- Template: `formatDiscountMessage`（直播折扣）；`formatDealMessage`（inbox / 旧路径）
