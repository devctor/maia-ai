import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/database";
import { DATABASE } from "../db/database.module";
import { insightCheckIns, insights, type InsightRow } from "../db/schema";

export interface NewInsightRecord {
  userId: string;
  summary: string;
  patterns: string[];
  topicsToDiscuss: string[];
  disclaimer: string;
  provider: string;
  model: string;
  sourceCheckInIds: string[];
}

/**
 * Persistence for insights and their provenance.
 *
 * The insight row and its `insight_check_ins` links are written in one transaction: an insight whose
 * source check-ins are unknown cannot be explained later, so a half-written pair must never exist.
 */
@Injectable()
export class InsightsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(record: NewInsightRecord): Promise<InsightRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(insights)
        .values({
          userId: record.userId,
          summary: record.summary,
          patterns: record.patterns,
          topicsToDiscuss: record.topicsToDiscuss,
          disclaimer: record.disclaimer,
          provider: record.provider,
          model: record.model,
        })
        .returning();

      if (!row) {
        throw new Error("The insight insert did not return a row");
      }

      if (record.sourceCheckInIds.length > 0) {
        await tx
          .insert(insightCheckIns)
          .values(record.sourceCheckInIds.map((checkInId) => ({ insightId: row.id, checkInId })));
      }

      return row;
    });
  }

  async findLatest(userId: string): Promise<InsightRow | null> {
    const [row] = await this.db
      .select()
      .from(insights)
      .where(eq(insights.userId, userId))
      .orderBy(desc(insights.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findSourceCheckInIds(insightId: string): Promise<string[]> {
    const rows = await this.db
      .select({ checkInId: insightCheckIns.checkInId })
      .from(insightCheckIns)
      .where(eq(insightCheckIns.insightId, insightId));
    return rows.map((row) => row.checkInId);
  }
}
