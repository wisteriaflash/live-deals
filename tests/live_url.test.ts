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
