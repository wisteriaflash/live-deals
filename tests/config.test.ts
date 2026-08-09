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
    expect(cfg.minDiscountYuan).toBe(3);
    expect(cfg.minDiscountRatio).toBe(0.1);
    expect(cfg.baselineWindowDays).toBe(14);
    expect(cfg.browserChannel).toBe("chrome");
  });
});
