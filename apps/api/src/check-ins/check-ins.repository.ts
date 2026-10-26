import { Inject, Injectable } from "@nestjs/common";
import type { CreateCheckInData } from "@maia/contracts";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/database";
import { DATABASE } from "../db/database.module";
import { checkIns, type CheckInRow } from "../db/schema";

/**
 * All SQL for check-ins. The service above it never sees a table, a column or a query builder, which
 * is what makes the business rules testable without a database.
 */
@Injectable()
export class CheckInsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * One statement on purpose: insert-or-update must be atomic. A "select then insert or update"
   * pair has a race window in which two requests for the same day both insert.
   */
  async upsert(userId: string, data: CreateCheckInData): Promise<CheckInRow> {
    const [row] = await this.db
      .insert(checkIns)
      .values({
        userId,
        date: data.date,
        wellbeing: data.wellbeing,
        sleepQuality: data.sleepQuality,
        energy: data.energy,
        stress: data.stress,
        symptoms: data.symptoms,
        notes: data.notes,
      })
      .onConflictDoUpdate({
        target: [checkIns.userId, checkIns.date],
        set: {
          wellbeing: data.wellbeing,
          sleepQuality: data.sleepQuality,
          energy: data.energy,
          stress: data.stress,
          symptoms: data.symptoms,
          notes: data.notes,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("The check-in upsert did not return a row");
    }
    return row;
  }

  async listRecent(userId: string, limit: number): Promise<CheckInRow[]> {
    return this.db
      .select()
      .from(checkIns)
      .where(eq(checkIns.userId, userId))
      .orderBy(desc(checkIns.date))
      .limit(limit);
  }

  async countByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(checkIns)
      .where(eq(checkIns.userId, userId));
    return result?.value ?? 0;
  }

  async findByIds(userId: string, ids: string[]): Promise<CheckInRow[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.userId, userId), inArray(checkIns.id, ids)));
  }
}
