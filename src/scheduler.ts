import type { AppConfig } from "./config.js";
import type { DealStore } from "./store.js";
import { pollSource } from "./poller.js";
import { sendWxPusher } from "./notify/wxpusher.js";

export function startScheduler(opts: {
  config: AppConfig;
  store: DealStore;
}): { stop: () => void } {
  const notify = (content: string) =>
    sendWxPusher({
      appToken: opts.config.wxpusher.appToken,
      uid: opts.config.wxpusher.uid,
      content,
    });

  const tick = async () => {
    for (const source of opts.config.sources.filter((s) => s.enabled)) {
      await pollSource({
        source,
        store: opts.store,
        brands: opts.config.brands,
        city: opts.config.city,
        dedupeWindowHours: opts.config.dedupeWindowHours,
        failureAlertThreshold: opts.config.failureAlertThreshold,
        notify,
      });
    }
  };

  void tick();
  const timer = setInterval(
    () => void tick(),
    opts.config.pollIntervalMinutes * 60_000,
  );
  return { stop: () => clearInterval(timer) };
}
