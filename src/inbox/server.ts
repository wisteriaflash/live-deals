import { Hono } from "hono";
import { processRawDeal } from "../pipeline.js";
import type { DealStore } from "../store.js";

export function createInboxApp(opts: {
  store: DealStore;
  brands: string[];
  city: string;
  dedupeWindowHours: number;
  notify: (content: string) => Promise<void>;
}) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/inbox", async (c) => {
    const body = await c.req.json<{
      text?: string;
      url?: string;
      force?: boolean;
    }>();
    const raw = [body.text, body.url].filter(Boolean).join("\n");
    if (!raw.trim()) return c.json({ error: "text or url required" }, 400);
    const result = await processRawDeal({
      store: opts.store,
      raw,
      origin: "inbox",
      brands: opts.brands,
      city: opts.city,
      dedupeWindowHours: opts.dedupeWindowHours,
      force: Boolean(body.force),
      fallbackUrl: body.url ?? null,
      notify: opts.notify,
    });
    if (result.status === "parse_failed") {
      return c.json({ status: result.status, message: "解析失败，请补品牌/标题" }, 422);
    }
    return c.json(result);
  });
  return app;
}
