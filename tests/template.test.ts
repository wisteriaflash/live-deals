import { describe, expect, it } from "vitest";
import { formatDealMessage } from "../src/notify/template.js";

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
