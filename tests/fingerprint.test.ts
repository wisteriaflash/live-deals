import { describe, expect, it } from "vitest";
import { dealFingerprint } from "../src/fingerprint.js";

describe("dealFingerprint", () => {
  it("is stable for normalized whitespace titles", () => {
    const input = {
      brand: "麦当劳",
      title: "  巨无霸   套餐  ",
      url: "https://example.com/deal",
    };
    const normalized = {
      brand: "麦当劳",
      title: "巨无霸 套餐",
      url: "https://example.com/deal",
    };
    expect(dealFingerprint(input)).toBe(dealFingerprint(normalized));
  });
});
