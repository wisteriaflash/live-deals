import { describe, expect, it } from "vitest";
import { resolveBaseline, median } from "../src/price_baseline.js";

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("resolveBaseline", () => {
  it("prefers list price", () => {
    expect(
      resolveBaseline({ listPrice: 26.8, historicalPrices: [30, 28] }),
    ).toBe(26.8);
  });

  it("uses historical median when no list price", () => {
    expect(
      resolveBaseline({ historicalPrices: [20, 22, 30] }),
    ).toBe(22);
  });

  it("returns null when neither available", () => {
    expect(resolveBaseline({ historicalPrices: [] })).toBeNull();
  });
});
