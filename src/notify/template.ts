import type { DealOrigin } from "../types.js";

export function formatDealMessage(input: {
  brand: string;
  title: string;
  summary: string;
  url: string | null;
  city: string;
  origin: DealOrigin;
}): string {
  return [
    `【${input.brand}】${input.title}`,
    `力度/摘要: ${input.summary}`,
    `城市: ${input.city}`,
    `来源: ${input.origin}`,
    input.url ? `链接: ${input.url}` : "链接: （无）",
  ].join("\n");
}

export function formatDiscountMessage(input: {
  brand: string;
  productName: string;
  price: number;
  baseline: number;
  saveYuan: number;
  saveRatio: number;
  city: string;
  origin: DealOrigin;
  url: string | null;
}): string {
  const pct = Math.round(input.saveRatio * 1000) / 10; // one decimal percent
  const yuan = Math.round(input.saveYuan * 100) / 100;
  return [
    `【${input.brand}】${input.productName}`,
    `现价: ${input.price}  基准: ${input.baseline}`,
    `比平时低: ¥${yuan}（约 ${pct}%）`,
    `城市: ${input.city}`,
    `来源: ${input.origin} / 直播`,
    input.url ? `链接: ${input.url}` : "链接: （无）",
  ].join("\n");
}

export function formatMaintenanceMessage(sourceId: string, failCount: number, error: string): string {
  return `源失效提醒: ${sourceId}\n连续失败: ${failCount}\n错误: ${error}\n请更新 config/default.yaml`;
}
