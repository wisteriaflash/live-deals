import { dealFingerprint } from "./fingerprint.js";
import { parseDealContent } from "./parser.js";
import { formatDealMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { DealOrigin } from "./types.js";

export async function processRawDeal(opts: {
  store: DealStore;
  raw: string;
  origin: DealOrigin;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  force: boolean;
  fallbackUrl: string | null;
  sourceId?: string | null;
  notify: (content: string) => Promise<void>;
}): Promise<{ status: "notified" | "deduped" | "parse_failed" | "notify_failed"; dealId?: number }> {
  opts.store.insertRaw(opts.sourceId ?? null, opts.raw);
  const parsed = parseDealContent({
    raw: opts.raw,
    brands: opts.brands,
    fallbackUrl: opts.fallbackUrl,
  });
  if (!parsed) return { status: "parse_failed" };

  const fingerprint = dealFingerprint(parsed);
  if (!opts.force && opts.store.wasNotifiedRecently(fingerprint, opts.dedupeWindowHours)) {
    return { status: "deduped" };
  }

  const dealId = opts.store.insertDeal({
    fingerprint,
    brand: parsed.brand,
    title: parsed.title,
    summary: parsed.summary,
    url: parsed.url,
    city: opts.city,
    origin: opts.origin,
  });

  const content = formatDealMessage({
    ...parsed,
    city: opts.city,
    origin: opts.origin,
  });

  try {
    await opts.notify(content);
    opts.store.markNotified(dealId, "sent");
    return { status: "notified", dealId };
  } catch (err) {
    try {
      await opts.notify(content);
      opts.store.markNotified(dealId, "sent");
      return { status: "notified", dealId };
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      opts.store.markNotified(dealId, "pending", message);
      return { status: "notify_failed", dealId };
    }
  }
}
