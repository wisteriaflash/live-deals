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
