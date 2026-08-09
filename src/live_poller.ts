import { captureLivePromo } from "./live_browser_poller.js";
import { processLivePromoCapture } from "./live_pipeline.js";
import { formatMaintenanceMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { BrowserChannel, SourceConfig } from "./types.js";

export async function pollLiveSource(opts: {
  source: SourceConfig;
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  failureAlertThreshold: number;
  baselineWindowDays: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
  browserChannel: BrowserChannel;
  notify: (content: string) => Promise<void>;
  capture?: typeof captureLivePromo;
}): Promise<void> {
  const captureFn = opts.capture ?? captureLivePromo;
  try {
    const captured = await captureFn({
      url: opts.source.url,
      browserChannel: opts.browserChannel,
    });
    const result = await processLivePromoCapture({
      store: opts.store,
      liveTitle: captured.liveTitle,
      liveSubTitle: captured.liveSubTitle,
      liveUrl: opts.source.url,
      sourceId: opts.source.id,
      brandHint: opts.source.brandHint,
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      baselineWindowDays: opts.baselineWindowDays,
      minDiscountYuan: opts.minDiscountYuan,
      minDiscountRatio: opts.minDiscountRatio,
      notify: opts.notify,
    });
    if (result.parseEmpty) {
      throw Object.assign(new Error("needs_manual promo parse empty"), {
        needsManual: true,
      });
    }
    opts.store.recordSourceSuccess(opts.source.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failCount = opts.store.recordSourceFailure(opts.source.id, message);
    if (failCount === opts.failureAlertThreshold) {
      await opts.notify(
        formatMaintenanceMessage(opts.source.id, failCount, message),
      );
    }
  }
}
