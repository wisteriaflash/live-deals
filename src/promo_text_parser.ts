import type { PromoItem } from "./types.js";

export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, "").trim().toLowerCase();
}

export function parsePromoText(...parts: Array<string | null | undefined>): PromoItem[] {
  // Join with newline so title (often brand-only, no price) does not bleed into subtitle offer names.
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return [];

  const chunks = text
    .split(/[！!;；。\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: PromoItem[] = [];
  const priceRe =
    /^(.*?)(\d+(?:\.\d+)?)\s*元?(?:\s*[（(]\s*原价\s*(\d+(?:\.\d+)?)\s*元?\s*[）)])?\s*$/u;

  for (const chunk of chunks) {
    const m = chunk.match(priceRe);
    if (!m) continue;
    const name = m[1].replace(/[:：\s]+$/u, "").trim();
    const price = Number(m[2]);
    if (!name || !Number.isFinite(price)) continue;
    const listPrice = m[3] !== undefined ? Number(m[3]) : undefined;
    const item: PromoItem = { name, price };
    if (listPrice !== undefined && Number.isFinite(listPrice)) {
      item.listPrice = listPrice;
    }
    items.push(item);
  }
  return items;
}
