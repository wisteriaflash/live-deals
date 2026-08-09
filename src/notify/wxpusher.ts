export async function sendWxPusher(opts: {
  appToken: string;
  uid: string;
  content: string;
  summary?: string;
}): Promise<void> {
  const res = await fetch("https://wxpusher.zjiecode.com/api/send/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appToken: opts.appToken,
      content: opts.content,
      summary: opts.summary ?? opts.content.slice(0, 20),
      contentType: 1,
      uids: [opts.uid],
    }),
  });
  if (!res.ok) {
    throw new Error(`WxPusher HTTP ${res.status}`);
  }
  const body = (await res.json()) as { success?: boolean; msg?: string };
  if (!body.success) {
    throw new Error(body.msg ?? "WxPusher send failed");
  }
}
