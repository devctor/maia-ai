import { z } from "zod";

/**
 * The single source of truth for the API surface.
 *
 * The API validates input with these schemas and the web app types its payloads with the inferred
 * types, so a contract change breaks compilation on both sides instead of silently drifting. The
 * schemas are runtime values, not decorator metadata: validation happens on data that really
 * arrives, not on a class whose shape the compiler already believes.
 */

/** Closed catalog: free text symptoms cannot be aggregated or compared over time. */
export const SYMPTOM_CODES = [
  "headache",
  "cramps",
  "bloating",
  "fatigue",
  "nausea",
  "back_pain",
  "breast_tenderness",
  "anxiety",
  "insomnia",
  "none",
] as const;

export const symptomSchema = z.enum(SYMPTOM_CODES);
export type Symptom = z.infer<typeof symptomSchema>;

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  headache: "Dolor de cabeza",
  cramps: "Cólicos",
  bloating: "Hinchazón",
  fatigue: "Cansancio",
  nausea: "Náuseas",
  back_pain: "Dolor de espalda",
  breast_tenderness: "Sensibilidad mamaria",
  anxiety: "Ansiedad",
  insomnia: "Insomnio",
  none: "Ninguno",
};

/**
 * A calendar day, not an instant. A check-in is "how I felt on the 7th", so it is stored as a
 * date and never shifted by a timezone; parsing it as an ISO date at UTC midnight keeps that true.
 */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "La fecha no existe en el calendario");

/** 1..5 scales: five labelled points are easy to answer and easy to compare over time. */
export const scaleSchema = z
  .number()
  .int("Debe ser un número entero")
  .min(1, "El valor mínimo es 1")
  .max(5, "El valor máximo es 5");

export const NOTES_MAX_LENGTH = 1000;

export const createCheckInSchema = z
  .object({
    date: isoDateSchema,
    wellbeing: scaleSchema,
    sleepQuality: scaleSchema,
    energy: scaleSchema,
    stress: scaleSchema,
    symptoms: z.array(symptomSchema).max(SYMPTOM_CODES.length).default([]),
    notes: z.string().trim().max(NOTES_MAX_LENGTH).nullish(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    // "Ninguno" is the absence of symptoms, and a symptom repeated twice is still one symptom.
    symptoms: value.symptoms.includes("none")
      ? []
      : [...new Set(value.symptoms.filter((symptom) => symptom !== "none"))],
    notes: value.notes?.trim() ? value.notes.trim() : null,
  }));

export type CreateCheckInInput = z.input<typeof createCheckInSchema>;
export type CreateCheckInData = z.output<typeof createCheckInSchema>;

export const listCheckInsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(90).default(30),
  })
  .strict();

export type ListCheckInsQuery = z.output<typeof listCheckInsQuerySchema>;

export const checkInSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string(),
  wellbeing: scaleSchema,
  sleepQuality: scaleSchema,
  energy: scaleSchema,
  stress: scaleSchema,
  symptoms: z.array(symptomSchema),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CheckIn = z.infer<typeof checkInSchema>;

export const checkInListSchema = z.object({
  items: z.array(checkInSchema),
});

export type CheckInList = z.infer<typeof checkInListSchema>;

/**
 * The shape the model must return. It is deliberately flat and small: every field maps to
 * something the UI renders, so nothing the model produces is silently dropped.
 *
 * `disclaimer` is accepted from the model but never trusted — the backend owns the stored text.
 */
export const INSIGHT_LIST_MAX_ITEMS = 5;
export const INSIGHT_ITEM_MAX_LENGTH = 240;
export const INSIGHT_SUMMARY_MAX_LENGTH = 1200;

export const insightContentSchema = z.object({
  summary: z.string().min(1).max(INSIGHT_SUMMARY_MAX_LENGTH),
  patterns: z.array(z.string().min(1).max(INSIGHT_ITEM_MAX_LENGTH)).max(INSIGHT_LIST_MAX_ITEMS),
  topicsToDiscuss: z
    .array(z.string().min(1).max(INSIGHT_ITEM_MAX_LENGTH))
    .max(INSIGHT_LIST_MAX_ITEMS),
});

export type InsightContent = z.infer<typeof insightContentSchema>;

export const INSIGHT_DISCLAIMER =
  "Este resumen es informativo y no constituye un diagnóstico médico. " +
  "Si algo te preocupa, coméntalo con un profesional de la salud.";

export const insightProviderSchema = z.enum(["gemini", "mock"]);
export type InsightProviderName = z.infer<typeof insightProviderSchema>;

export const insightSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  summary: z.string(),
  patterns: z.array(z.string()),
  topicsToDiscuss: z.array(z.string()),
  disclaimer: z.string(),
  provider: insightProviderSchema,
  model: z.string(),
  sourceCheckInIds: z.array(z.string().uuid()),
  createdAt: z.string(),
});

export type Insight = z.infer<typeof insightSchema>;

export const generateInsightSchema = z
  .object({
    // Privacy control: notes can mention things a user does not want sent to a third party.
    includeNotes: z.boolean().default(false),
  })
  .strict();

export type GenerateInsightInput = z.input<typeof generateInsightSchema>;
export type GenerateInsightData = z.output<typeof generateInsightSchema>;

/** Machine-readable error codes. The UI switches on these, never on message text. */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_GUARDRAIL_REJECTED: "AI_GUARDRAIL_REJECTED",
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** The model asked for more time than the configured budget allowed. */
  AI_TIMEOUT: "AI_TIMEOUT",
  /** The client went away mid-stream; nothing is persisted. */
  AI_STREAM_ABORTED: "AI_STREAM_ABORTED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorResponseSchema = z.object({
  statusCode: z.number(),
  code: z.enum(ERROR_CODES as unknown as [ErrorCode, ...ErrorCode[]]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** The minimum number of check-ins an insight can be derived from. */
export const MIN_CHECK_INS_FOR_INSIGHT = 2;
/** How many of the most recent check-ins are sent to the model. */
export const INSIGHT_WINDOW_SIZE = 10;
