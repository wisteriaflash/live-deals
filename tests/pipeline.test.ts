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
