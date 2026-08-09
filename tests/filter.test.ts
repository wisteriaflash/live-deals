import { describe, expect, it } from "vitest";
import { matchBrand } from "../src/filter.js";

describe("matchBrand", () => {
  const brands = ["麦当劳", "肯德基", "汉堡王"];

  it("detects 麦当劳 in text", () => {
    expect(matchBrand("上海麦当劳直播间优惠", brands)).toBe("麦当劳");
  });

  it("returns null for 星巴克", () => {
    expect(matchBrand("星巴克咖啡直播", brands)).toBeNull();
  });
});
