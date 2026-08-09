import * as cheerio from "cheerio";
import { matchBrand } from "./filter.js";

export type ParsedDeal = {
  brand: string;
  title: string;
  summary: string;
  url: string | null;
};

export function parseDealContent(opts: {
  raw: string;
  brands: string[];
  fallbackUrl: string | null;
  brandHint?: string;
}): ParsedDeal | null {
  const looksHtml = /<html|<body|<h1|<a\s/i.test(opts.raw);
  let title = opts.raw.trim();
  let url = opts.fallbackUrl;

  if (looksHtml) {
    const $ = cheerio.load(opts.raw);
    title = $("h1").first().text().trim() || $("title").text().trim() || title;
    const href = $("a[href]").first().attr("href");
    if (href) url = href;
  } else {
    const firstLine = opts.raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (firstLine) title = firstLine;
  }

  const brand =
    matchBrand(title, opts.brands) ??
    matchBrand(opts.raw, opts.brands) ??
    (opts.brandHint && opts.brands.includes(opts.brandHint) ? opts.brandHint : null);
  if (!brand) return null;

  const price = title.match(/(\d+(?:\.\d+)?)\s*元?/);
  const summary = price ? price[1] : title.slice(0, 40);

  return { brand, title, summary, url };
}
