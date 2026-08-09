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
