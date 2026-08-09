import fs from "node:fs";
import YAML from "yaml";
import { z } from "zod";

const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  brandHint: z.string().optional(),
  enabled: z.boolean().default(true),
});

const FileConfigSchema = z.object({
  city: z.literal("上海").default("上海"),
  brands: z.array(z.string().min(1)).min(1),
  pollIntervalMinutes: z.number().int().min(1).max(60).default(8),
  dedupeWindowHours: z.number().int().min(1).max(168).default(12),
  failureAlertThreshold: z.number().int().min(1).default(3),
  minDiscountYuan: z.number().min(0).default(3),
  minDiscountRatio: z.number().min(0).max(1).default(0.1),
  baselineWindowDays: z.number().int().min(1).max(90).default(14),
  browserChannel: z.enum(["chrome", "chromium"]).default("chrome"),
  inboxHost: z.string().default("127.0.0.1"),
  inboxPort: z.number().int().default(8787),
  sources: z.array(SourceSchema).default([]),
});

export type AppConfig = z.infer<typeof FileConfigSchema> & {
  wxpusher: { appToken: string; uid: string };
  databasePath: string;
};

export function loadConfig(opts: {
  configPath: string;
  env: NodeJS.ProcessEnv;
}): AppConfig {
  const raw = YAML.parse(fs.readFileSync(opts.configPath, "utf8"));
  const file = FileConfigSchema.parse(raw);
  const appToken = opts.env.WXPUSHER_APP_TOKEN;
  const uid = opts.env.WXPUSHER_UID;
  if (!appToken || !uid) {
    throw new Error("WXPUSHER_APP_TOKEN and WXPUSHER_UID are required");
  }
  return {
    ...file,
    wxpusher: { appToken, uid },
    databasePath: opts.env.DATABASE_PATH ?? "./data/deals.db",
  };
}
