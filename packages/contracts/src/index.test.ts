import { describe, expect, it } from "vitest";
import {
  MIN_CHECK_INS_FOR_INSIGHT,
  createCheckInSchema,
  generateInsightSchema,
  insightContentSchema,
  listCheckInsQuerySchema,
} from "./index";

/**
 * These tests exist because the contract is the one thing two applications and a database all
 * depend on. A silent change here is not a failing unit test somewhere else — it is a runtime
 * mismatch in the browser, or an invalid row in storage.
 */
describe("createCheckInSchema", () => {
  const valid = {
    date: "2026-01-05",
    wellbeing: 4,
    sleepQuality: 2,
    energy: 3,
    stress: 5,
  };

  it("accepts a minimal check-in and defaults the optional fields", () => {
    expect(createCheckInSchema.parse(valid)).toEqual({ ...valid, symptoms: [], notes: null });
  });

  it("collapses 'none' and duplicates into an empty symptom list", () => {
    const parsed = createCheckInSchema.parse({
      ...valid,
      symptoms: ["headache", "headache", "none"],
    });
    expect(parsed.symptoms).toEqual([]);
  });

  it("trims notes and turns a blank note into null", () => {
    expect(createCheckInSchema.parse({ ...valid, notes: "  hola  " }).notes).toBe("hola");
    expect(createCheckInSchema.parse({ ...valid, notes: "   " }).notes).toBeNull();
  });

  it("rejects a value outside the 1..5 scale", () => {
    for (const bad of [0, 6, 3.5]) {
      expect(createCheckInSchema.safeParse({ ...valid, wellbeing: bad }).success).toBe(false);
    }
  });

  it("rejects an impossible calendar day that matches the format", () => {
    expect(createCheckInSchema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
    expect(createCheckInSchema.safeParse({ ...valid, date: "05-01-2026" }).success).toBe(false);
  });

  it("rejects unknown fields instead of dropping them silently", () => {
    expect(createCheckInSchema.safeParse({ ...valid, age: 30 }).success).toBe(false);
  });

  it("rejects notes longer than the documented limit", () => {
    expect(createCheckInSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
    expect(createCheckInSchema.safeParse({ ...valid, notes: "x".repeat(1000) }).success).toBe(true);
  });

  it("rejects a symptom outside the closed catalog", () => {
    expect(createCheckInSchema.safeParse({ ...valid, symptoms: ["dolor"] }).success).toBe(false);
  });
});

describe("listCheckInsQuerySchema", () => {
  it("defaults the limit and coerces a numeric string from the query string", () => {
    expect(listCheckInsQuerySchema.parse({}).limit).toBe(30);
    expect(listCheckInsQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("rejects zero, an excessive limit and a non-numeric value", () => {
    for (const limit of ["0", "91", "abc", "-1"]) {
      expect(listCheckInsQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });
});

describe("generateInsightSchema", () => {
  it("defaults includeNotes to false: notes are not sent unless asked for", () => {
    expect(generateInsightSchema.parse({}).includeNotes).toBe(false);
  });

  it("requires a boolean, not a truthy string", () => {
    expect(generateInsightSchema.safeParse({ includeNotes: "true" }).success).toBe(false);
  });
});

describe("insightContentSchema", () => {
  it("accepts the documented shape", () => {
    const result = insightContentSchema.safeParse({
      summary: "Resumen",
      patterns: ["a"],
      topicsToDiscuss: ["b"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty summary and an oversized list", () => {
    expect(
      insightContentSchema.safeParse({ summary: "", patterns: [], topicsToDiscuss: [] }).success,
    ).toBe(false);
    expect(
      insightContentSchema.safeParse({
        summary: "ok",
        patterns: ["a", "b", "c", "d", "e", "f"],
        topicsToDiscuss: [],
      }).success,
    ).toBe(false);
  });
});

describe("shared constants", () => {
  it("keeps the documented minimum of two check-ins for an insight", () => {
    expect(MIN_CHECK_INS_FOR_INSIGHT).toBe(2);
  });
});
