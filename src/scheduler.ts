import type { AppConfig } from "./config.js";
import type { DealStore } from "./store.js";
import { isMeituanLiveUrl } from "./live_url.js";
import { pollLiveSource } from "./live_poller.js";
import { pollSource } from "./poller.js";
import { sendWxPusher } from "./notify/wxpusher.js";
import { formatDealMessage } from "./notify/template.js";

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

  const flushPending = async () => {
    for (const item of opts.store.listPendingNotifications()) {
      const deal = opts.store.getDeal(item.dealId);
      if (!deal) continue;
      const content = formatDealMessage({
        brand: deal.brand,
        title: deal.title,
        summary: deal.summary,
        url: deal.url,
        city: deal.city,
        origin: deal.origin,
      });
      try {
        await notify(content);
        opts.store.markNotificationSent(item.notificationId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        opts.store.markNotificationFailed(item.notificationId, message);
      }
    }
  };

  const tick = async () => {
    await flushPending();
    for (const source of opts.config.sources.filter((s) => s.enabled)) {
      if (isMeituanLiveUrl(source.url)) {
        await pollLiveSource({
          source,
          store: opts.store,
          brands: opts.config.brands,
          city: opts.config.city,
          dedupeWindowHours: opts.config.dedupeWindowHours,
          failureAlertThreshold: opts.config.failureAlertThreshold,
          baselineWindowDays: opts.config.baselineWindowDays,
          minDiscountYuan: opts.config.minDiscountYuan,
          minDiscountRatio: opts.config.minDiscountRatio,
          browserChannel: opts.config.browserChannel,
          notify,
        });
      } else {
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
    }
  };

  void tick();
  const timer = setInterval(
    () => void tick(),
    opts.config.pollIntervalMinutes * 60_000,
  );
  return { stop: () => clearInterval(timer) };
}
