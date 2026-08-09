import { dealFingerprint } from "./fingerprint.js";
import { evaluateDiscountGate } from "./deal_gate.js";
import { formatDiscountMessage } from "./notify/template.js";
import { normalizeProductName, parsePromoText } from "./promo_text_parser.js";
import { resolveBaseline } from "./price_baseline.js";
import type { DealStore } from "./store.js";

export async function processLivePromoCapture(opts: {
  store: DealStore;
  liveTitle: string;
  liveSubTitle: string;
  liveUrl: string;
  sourceId: string;
  brandHint?: string;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  baselineWindowDays: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
  notify: (content: string) => Promise<void>;
}): Promise<{ recorded: number; notified: number; parseEmpty: boolean }> {
  const rawPayload = JSON.stringify({
    liveTitle: opts.liveTitle,
    liveSubTitle: opts.liveSubTitle,
  });
  opts.store.insertRaw(opts.sourceId, rawPayload);

  const items = parsePromoText(opts.liveTitle, opts.liveSubTitle);
  if (items.length === 0) {
    return { recorded: 0, notified: 0, parseEmpty: true };
  }

  const brand =
    opts.brandHint && opts.brands.includes(opts.brandHint)
      ? opts.brandHint
      : opts.brands.find((b) => `${opts.liveTitle}${opts.liveSubTitle}`.includes(b)) ??
        opts.brandHint ??
        opts.brands[0]!;

  let recorded = 0;
  let notified = 0;

  for (const item of items) {
    const normalizedName = normalizeProductName(item.name);
    const historical = opts.store.listPricesForName(
      normalizedName,
      opts.baselineWindowDays,
    );
    opts.store.insertPriceObservation({
      normalizedName,
      price: item.price,
      sourceId: opts.sourceId,
    });
    recorded += 1;

    const baseline = resolveBaseline({
      listPrice: item.listPrice,
      historicalPrices: historical,
    });
    if (baseline === null) continue;

    const gate = evaluateDiscountGate({
      price: item.price,
      baseline,
      minDiscountYuan: opts.minDiscountYuan,
      minDiscountRatio: opts.minDiscountRatio,
    });
    if (!gate.ok) continue;

    const title = item.name;
    const summary = `现价${item.price}/基准${baseline}`;
    const fingerprint = dealFingerprint({
      brand,
      title,
      url: opts.liveUrl,
    });
    if (opts.store.wasNotifiedRecently(fingerprint, opts.dedupeWindowHours)) {
      continue;
    }

    const dealId = opts.store.insertDeal({
      fingerprint,
      brand,
      title,
      summary,
      url: opts.liveUrl,
      city: opts.city,
      origin: "poll",
    });

    const content = formatDiscountMessage({
      brand,
      productName: item.name,
      price: item.price,
      baseline,
      saveYuan: gate.saveYuan,
      saveRatio: gate.saveRatio,
      city: opts.city,
      origin: "poll",
      url: opts.liveUrl,
    });

    try {
      await opts.notify(content);
      opts.store.markNotified(dealId, "sent");
      notified += 1;
    } catch {
      try {
        await opts.notify(content);
        opts.store.markNotified(dealId, "sent");
        notified += 1;
      } catch (err2) {
        const message = err2 instanceof Error ? err2.message : String(err2);
        opts.store.markNotified(dealId, "pending", message);
      }
    }
  }

  return { recorded, notified, parseEmpty: false };
}
