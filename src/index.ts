import path from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { DealStore } from "./store.js";
import { startScheduler } from "./scheduler.js";
import { createInboxApp } from "./inbox/server.js";
import { sendWxPusher } from "./notify/wxpusher.js";
import { loadEnvFile } from "./loadEnv.js";

async function main() {
  loadEnvFile();
  const config = loadConfig({
    configPath: path.join(process.cwd(), "config/default.yaml"),
    env: process.env,
  });
  const store = new DealStore(openDb(config.databasePath));
  const notify = (content: string) =>
    sendWxPusher({
      appToken: config.wxpusher.appToken,
      uid: config.wxpusher.uid,
      content,
    });

  const app = createInboxApp({
    store,
    brands: config.brands,
    city: config.city,
    dedupeWindowHours: config.dedupeWindowHours,
    notify,
  });

  serve({ fetch: app.fetch, hostname: config.inboxHost, port: config.inboxPort });
  startScheduler({ config, store });
  console.log(
    `listening on http://${config.inboxHost}:${config.inboxPort} ; polling every ${config.pollIntervalMinutes}m`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
