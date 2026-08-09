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
