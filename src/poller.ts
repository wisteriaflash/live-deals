import { processRawDeal } from "./pipeline.js";
import { formatMaintenanceMessage } from "./notify/template.js";
import type { DealStore } from "./store.js";
import type { SourceConfig } from "./types.js";

export async function pollSource(opts: {
  source: SourceConfig;
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  failureAlertThreshold: number;
  notify: (content: string) => Promise<void>;
}): Promise<void> {
  try {
    const res = await fetch(opts.source.url, {
      redirect: "follow",
      headers: { "user-agent": "meituan-live-deals/0.1 (+personal)" },
    });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`needs_manual HTTP ${res.status}`), {
        needsManual: true,
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    await processRawDeal({
      store: opts.store,
      raw,
      origin: "poll",
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      force: false,
      fallbackUrl: opts.source.url,
      sourceId: opts.source.id,
      notify: opts.notify,
    });
    opts.store.recordSourceSuccess(opts.source.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failCount = opts.store.recordSourceFailure(opts.source.id, message);
    if (failCount >= opts.failureAlertThreshold) {
      await opts.notify(
        formatMaintenanceMessage(opts.source.id, failCount, message),
      );
    }
  }
}
