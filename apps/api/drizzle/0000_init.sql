-- Maia Care — initial schema.
-- Invariants that must survive any code change live here: the day uniqueness that makes check-in
-- creation idempotent, the 1..5 bounds, and the provenance link between an insight and its inputs.
-- Guards in application code can be bypassed by a migration, a script or a manual query; these
-- cannot.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "check_ins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "wellbeing" real NOT NULL CHECK ("wellbeing" BETWEEN 1 AND 5),
  "sleep_quality" real NOT NULL CHECK ("sleep_quality" BETWEEN 1 AND 5),
  "energy" real NOT NULL CHECK ("energy" BETWEEN 1 AND 5),
  "stress" real NOT NULL CHECK ("stress" BETWEEN 1 AND 5),
  "symptoms" text[] NOT NULL DEFAULT '{}',
  "notes" text CHECK (char_length("notes") <= 1000),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One check-in per user per day. The service upserts against this index.
CREATE UNIQUE INDEX IF NOT EXISTS "check_ins_user_date_unique" ON "check_ins" ("user_id", "date");
-- The only read path is "this user's most recent N", so the index carries the sort.
CREATE INDEX IF NOT EXISTS "check_ins_user_date_desc_idx" ON "check_ins" ("user_id", "date" DESC);

CREATE TABLE IF NOT EXISTS "insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "patterns" text[] NOT NULL DEFAULT '{}',
  "topics_to_discuss" text[] NOT NULL DEFAULT '{}',
  "disclaimer" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "insights_user_created_at_desc_idx"
  ON "insights" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "insight_check_ins" (
  "insight_id" uuid NOT NULL REFERENCES "insights"("id") ON DELETE CASCADE,
  "check_in_id" uuid NOT NULL REFERENCES "check_ins"("id") ON DELETE CASCADE,
  PRIMARY KEY ("insight_id", "check_in_id")
);
