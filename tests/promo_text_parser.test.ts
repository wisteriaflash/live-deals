import { describe, expect, it } from "vitest";
import { parsePromoText, normalizeProductName } from "../src/promo_text_parser.js";

describe("parsePromoText", () => {
  it("splits multiple priced offers from subtitle", () => {
    const items = parsePromoText(
      "圆筒冰淇淋2元！柠檬蛋奶冰淇淋3元！3份薯条19.9元！",
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining("圆筒冰淇淋"), price: 2 }),
        expect.objectContaining({ name: expect.stringContaining("柠檬蛋奶冰淇淋"), price: 3 }),
        expect.objectContaining({ name: expect.stringContaining("薯条"), price: 19.9 }),
      ]),
    );
    expect(items).toHaveLength(3);
  });

  it("extracts list price when present", () => {
    const items = parsePromoText("3份薯条19.9元（原价26.8元）");
    expect(items[0]?.price).toBe(19.9);
    expect(items[0]?.listPrice).toBe(26.8);
  });

  it("returns empty for unparseable text", () => {
    expect(parsePromoText("今晚福利多多敬请期待")).toEqual([]);
  });
});

describe("normalizeProductName", () => {
  it("strips spaces and lowercases for history key", () => {
    expect(normalizeProductName(" 3份 薯条 ")).toBe("3份薯条");
  });
});
