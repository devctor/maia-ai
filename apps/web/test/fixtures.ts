import { INSIGHT_DISCLAIMER, type CheckIn, type Insight } from "@maia/contracts";

/**
 * Shared fixtures. The ids are real uuids because the contracts validate them, which keeps the
 * tests honest about the shape the API really returns.
 */

export function uuid(seed: number): string {
  const tail = `${seed}`.padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

export function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: uuid(1),
    userId: uuid(2),
    date: "2025-03-01",
    wellbeing: 3,
    sleepQuality: 4,
    energy: 2,
    stress: 5,
    symptoms: [],
    notes: null,
    createdAt: "2025-03-01T10:00:00.000Z",
    updatedAt: "2025-03-01T10:00:00.000Z",
    ...overrides,
  };
}

export function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: uuid(3),
    userId: uuid(2),
    summary: "Tu energía ha subido y el estrés ha bajado esta semana.",
    patterns: ["Más energía los días con mejor sueño"],
    topicsToDiscuss: ["Cómo mantener una rutina de sueño constante"],
    disclaimer: INSIGHT_DISCLAIMER,
    provider: "mock",
    model: "mock-model",
    sourceCheckInIds: [uuid(1)],
    createdAt: "2025-03-02T10:00:00.000Z",
    ...overrides,
  };
}

/** Minimal `Response` double: the client only reads status, ok, json and body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Minimal SSE response double that replays the given chunks, one per read. */
export function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        async read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = chunks[index];
          index += 1;
          return { done: false, value: encoder.encode(chunk) };
        },
        releaseLock(): void {},
      }),
    },
    json: async () => ({}),
  } as unknown as Response;
}

export function errorEnvelope(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    statusCode,
    code,
    message,
    ...(details ? { details } : {}),
    requestId: "req-test-1",
  };
}
