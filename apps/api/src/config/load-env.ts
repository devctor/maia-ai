import fs from "node:fs";
import path from "node:path";

/**
 * Both `pnpm dev` (cwd = apps/api) and a root-level script need the same `.env`. Node 22 ships
 * `process.loadEnvFile`, so this does not add a runtime dependency for something the platform
 * already provides.
 */
export function loadEnvFile(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../.env"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
