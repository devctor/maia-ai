import { loadEnvFile } from "../config/load-env";

loadEnvFile();

import { createDatabase, runMigrations } from "../db/database";

/**
 * Migrations run as an explicit step (`pnpm db:migrate`) and also from the container entrypoint.
 * They never run implicitly at import time: a web request must not be able to rewrite the schema.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const connection = createDatabase(connectionString);
  try {
    await runMigrations(connection.db);
    console.log("Migrations applied");
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
