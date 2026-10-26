import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/database";
import { DATABASE } from "../db/database.module";

/**
 * Liveness plus a real database round-trip. A container that answers 200 while its pool is dead is
 * worse than one that fails the probe: the orchestrator would route traffic to a broken instance.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: "ok"; database: "ok"; checkedAt: string }> {
    await this.db.execute(sql`select 1`);
    return { status: "ok", database: "ok", checkedAt: new Date().toISOString() };
  }
}
