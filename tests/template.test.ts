import { describe, expect, it } from "vitest";
import { formatDealMessage, formatDiscountMessage } from "../src/notify/template.js";

describe("formatDealMessage", () => {
  it("includes brand city origin and url", () => {
    const msg = formatDealMessage({
      brand: "肯德基",
      title: "疯狂星期四",
      summary: "29.9",
      url: "https://example.com/kfc",
      city: "上海",
      origin: "poll",
    });
    expect(msg).toContain("肯德基");
    expect(msg).toContain("上海");
    expect(msg).toContain("poll");
    expect(msg).toContain("https://example.com/kfc");
  });
});

describe("formatDiscountMessage", () => {
  it("includes current price baseline and savings", () => {
    const msg = formatDiscountMessage({
      brand: "麦当劳",
      productName: "3份薯条",
      price: 19.9,
      baseline: 26.8,
      saveYuan: 6.9,
      saveRatio: 6.9 / 26.8,
      city: "上海",
      origin: "poll",
      url: "https://g.meituan.com/app/business-live-broadcast/live-detail-new.html?liveid=15483849",
    });
    expect(msg).toContain("现价");
    expect(msg).toContain("19.9");
    expect(msg).toContain("基准");
    expect(msg).toContain("26.8");
    expect(msg).toContain("比平时低");
    expect(msg).toContain("poll");
    expect(msg).toContain("liveid=15483849");
  });
});
