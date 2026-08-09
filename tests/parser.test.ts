import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDealContent } from "../src/parser.js";

describe("parseDealContent", () => {
  it("parses html fixture", () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/sample-deal.html"),
      "utf8",
    );
    const parsed = parseDealContent({
      raw: html,
      brands: ["麦当劳", "肯德基"],
      fallbackUrl: null,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.brand).toBe("麦当劳");
    expect(parsed!.title).toContain("双人成双套餐");
    expect(parsed!.url).toContain("example.com/deal/mcd-39");
  });

  it("returns null when brand missing", () => {
    expect(
      parseDealContent({
        raw: "无关优惠",
        brands: ["麦当劳"],
        fallbackUrl: null,
      }),
    ).toBeNull();
  });
});
