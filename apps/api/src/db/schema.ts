import { date, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Schema notes
 *
 * - `date` on a check-in is a `date` column (not a timestamp): a check-in belongs to a calendar
 *   day, and storing an instant would make the same day land on different values per timezone.
 * - One check-in per user per day is enforced by a unique index. The service relies on it for an
 *   idempotent upsert, so the guarantee lives in the database, not in application hope.
 * - A number of metrics use `real` with check constraints (see the migration) instead of an enum,
 *   because the scale is an ordered quantity, and a check constraint expresses the bound once.
 * - `insight_check_ins` is the provenance table: it records exactly which check-ins produced an
 *   insight. Storing the generated text without that link would make the output unexplainable.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    wellbeing: real("wellbeing").notNull(),
    sleepQuality: real("sleep_quality").notNull(),
    energy: real("energy").notNull(),
    stress: real("stress").notNull(),
    symptoms: text("symptoms").array().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("check_ins_user_date_unique").on(table.userId, table.date)],
);

export const insights = pgTable("insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  patterns: text("patterns").array().notNull().default([]),
  topicsToDiscuss: text("topics_to_discuss").array().notNull().default([]),
  disclaimer: text("disclaimer").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insightCheckIns = pgTable(
  "insight_check_ins",
  {
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    checkInId: uuid("check_in_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.insightId, table.checkInId] })],
);

export type UserRow = typeof users.$inferSelect;
export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;
export type InsightRow = typeof insights.$inferSelect;
export type NewInsightRow = typeof insights.$inferInsert;
