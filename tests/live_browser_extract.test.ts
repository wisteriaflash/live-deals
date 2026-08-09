import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractLivePromoFields, isLiveStudioInfoUrl } from "../src/live_browser_poller.js";

describe("live browser extract helpers", () => {
  it("matches livestudiobaseinfo urls", () => {
    expect(
      isLiveStudioInfoUrl(
        "https://mlive.meituan.com/live/livestudiobaseinfo.bin?liveid=1",
      ),
    ).toBe(true);
    expect(isLiveStudioInfoUrl("https://example.com/other")).toBe(false);
  });

  it("extracts title fields from fixture json", () => {
    const json = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "tests/fixtures/livestudiobaseinfo.json"),
        "utf8",
      ),
    );
    const fields = extractLivePromoFields(json);
    expect(fields.liveTitle).toContain("麦当劳");
    expect(fields.liveSubTitle).toContain("薯条");
  });
});
