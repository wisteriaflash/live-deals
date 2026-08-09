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
