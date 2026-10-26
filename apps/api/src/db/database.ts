import { Logger } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
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

/** The migrations folder is shipped next to the build output; both layouts are resolved. */
export function resolveMigrationsFolder(): string {
  return path.join(__dirname, "..", "..", "drizzle");
}

export async function runMigrations(database: Database): Promise<void> {
  const folder = resolveMigrationsFolder();
  await migrate(database, { migrationsFolder: folder });
  Logger.log(`Migrations applied from ${folder}`, "Database");
}
