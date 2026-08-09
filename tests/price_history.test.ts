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
