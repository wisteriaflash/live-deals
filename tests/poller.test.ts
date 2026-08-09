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
