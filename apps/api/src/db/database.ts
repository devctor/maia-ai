import { Logger } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * A single pool per process. The pool owns connection limits and reconnection; nothing above this
 * layer opens a connection or writes SQL.
 */
export function createDatabase(connectionString: string): DatabaseConnection {
  const pool = new Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

/**
 * The migrations folder is resolved relative to the package, not to the compiled file: `dist/`,
 * the end-to-end build and a test runner each place `__dirname` somewhere different, and a missing
 * folder is a confusing runtime error rather than a compile error.
 */
export function resolveMigrationsFolder(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "drizzle"),
    path.join(process.cwd(), "drizzle"),
    path.join(process.cwd(), "apps", "api", "drizzle"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, "meta", "_journal.json")));
  if (!found) {
    throw new Error(`Could not locate the drizzle migrations folder. Tried: ${candidates.join(", ")}`);
  }
  return found;
}

export async function runMigrations(database: Database): Promise<void> {
  const folder = resolveMigrationsFolder();
  await migrate(database, { migrationsFolder: folder });
  Logger.log(`Migrations applied from ${folder}`, "Database");
}
