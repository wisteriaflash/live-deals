import { chromium, type Browser } from "playwright";
import type { BrowserChannel } from "./types.js";

export function isLiveStudioInfoUrl(url: string): boolean {
  return /livestudiobaseinfo/i.test(url);
}

export function extractLivePromoFields(json: unknown): {
  liveTitle: string;
  liveSubTitle: string;
} {
  const root = json as Record<string, unknown> | null;
  const data =
    root && typeof root === "object" && root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root && typeof root === "object"
        ? root
        : {};
  const liveTitle = String(data?.liveTitle ?? data?.title ?? "");
  const liveSubTitle = String(
    data?.liveSubTitle ?? data?.subTitle ?? data?.subtitle ?? "",
  );
  return { liveTitle, liveSubTitle };
}

export type LiveCaptureResult = {
  liveTitle: string;
  liveSubTitle: string;
  rawJson: string;
};

export async function captureLivePromo(opts: {
  url: string;
  browserChannel: BrowserChannel;
  timeoutMs?: number;
}): Promise<LiveCaptureResult> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      channel: opts.browserChannel === "chrome" ? "chrome" : undefined,
      headless: true,
    });
    const page = await browser.newPage();
    let captured: LiveCaptureResult | null = null;

    page.on("response", async (response) => {
      try {
        if (!isLiveStudioInfoUrl(response.url())) return;
        if (captured) return;
        const json = await response.json();
        const fields = extractLivePromoFields(json);
        if (!fields.liveTitle && !fields.liveSubTitle) return;
        captured = {
          ...fields,
          rawJson: JSON.stringify(json),
        };
      } catch {
        // ignore non-json / aborted
      }
    });

    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (!captured && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!captured) {
      throw Object.assign(new Error("needs_manual no livestudiobaseinfo json"), {
        needsManual: true,
      });
    }
    return captured;
  } finally {
    await browser?.close();
  }
}
