/**
 * The application reads configuration from `process.env`, which in production is populated by the
 * container or the shell. Jest starts with an empty environment, so the repository `.env` is loaded
 * here — once, before any module graph is built.
 *
 * Parsed manually instead of with `process.loadEnvFile` because a value containing `#` (a key or a
 * password may) is truncated by that loader's comment handling.
 */
const path = require("node:path");
const fs = require("node:fs");

const target = [
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "../../.env"),
].find((candidate) => fs.existsSync(candidate));

if (target) {
  for (const line of fs.readFileSync(target, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the end-to-end suite");
}
