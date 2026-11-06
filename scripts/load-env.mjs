// Minimal .env loader for node (no quote stripping — same rules as dev.mjs).
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const dir = fileURLToPath(new URL("..", import.meta.url));

export function config() {
  const envPath = resolve(dir, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (val.startsWith("* ") || val.startsWith("//")) continue;
      process.env[key] = val;
    }
  }
  return null;
}
