import { createHash } from "node:crypto";

export function dealFingerprint(input: {
  brand: string;
  title: string;
  url: string | null;
}): string {
  const title = input.title.replace(/\s+/g, " ").trim().toLowerCase();
  const url = (input.url ?? "").trim().toLowerCase();
  const raw = `${input.brand}|${title}|${url}`;
  return createHash("sha256").update(raw).digest("hex");
}
