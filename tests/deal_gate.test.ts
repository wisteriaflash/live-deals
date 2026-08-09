import { describe, expect, it } from "vitest";
import { evaluateDiscountGate } from "../src/deal_gate.js";

describe("evaluateDiscountGate", () => {
  it("allows when absolute savings >= 3", () => {
    const r = evaluateDiscountGate({
      price: 19.9,
      baseline: 26.8,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(true);
    expect(r.saveYuan).toBeCloseTo(6.9, 5);
    expect(r.saveRatio).toBeGreaterThan(0.1);
  });

  it("allows when ratio >= 10% even if yuan < 3", () => {
    const r = evaluateDiscountGate({
      price: 9,
      baseline: 10,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(true);
    expect(r.saveYuan).toBe(1);
    expect(r.saveRatio).toBeCloseTo(0.1, 5);
  });

  it("rejects when below both thresholds", () => {
    const r = evaluateDiscountGate({
      price: 19,
      baseline: 20,
      minDiscountYuan: 3,
      minDiscountRatio: 0.1,
    });
    expect(r.ok).toBe(false);
  });
});
