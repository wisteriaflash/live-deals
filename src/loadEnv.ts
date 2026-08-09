import fs from "node:fs";
import path from "node:path";

/** Load key=value pairs from a .env file into process.env (does not override existing). */
export function loadEnvFile(filePath = path.join(process.cwd(), ".env")): void {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
