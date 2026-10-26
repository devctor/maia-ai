import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

/**
 * drizzle-kit loads this file through CJS `require`, so it cannot import the project's TypeScript
 * sources — `../src/config/load-env` fails at load time. The config therefore stays self-contained:
 * it reads the environment with the platform's own `.env` support instead of sharing the API's
 * loader, and it resolves the file relative to this config so the working directory does not matter.
 *
 * `generate` only needs the schema to diff; the connection string is only used to confirm the
 * target during interactive prompts.
 */
for (const candidate of [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, ".env"),
]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
