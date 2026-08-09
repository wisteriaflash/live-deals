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
