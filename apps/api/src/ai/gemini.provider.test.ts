import { describe, expect, it, vi } from "vitest";
import { AiTimeoutError, AiUnavailableError } from "../common/errors";
import type { CheckInRow } from "../db/schema";
import { GeminiAiProvider } from "./gemini.provider";

const checkIn: CheckInRow = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "11111111-1111-4111-8111-111111111111",
  date: "2025-01-08",
  wellbeing: 4,
  sleepQuality: 3,
  energy: 4,
  stress: 2,
  symptoms: ["fatigue"],
  notes: null,
  createdAt: new Date("2025-01-08T09:30:00.000Z"),
  updatedAt: new Date("2025-01-08T09:30:00.000Z"),
};

const input = { checkIns: [checkIn], includeNotes: false };
const config = {
  provider: "gemini" as const,
  apiKey: "secret-api-key",
  model: "gemini-test",
  timeoutMs: 1_000,
  maxAttempts: 3,
  retryBaseDelayMs: 10,
};

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, { status });
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected the operation to fail");
    },
    (error: unknown) => error,
  );
}

describe("GeminiAiProvider", () => {
  it("parses SSE deltas, ignores thought-only frames and handles split frames", async () => {
    const thoughtFrame = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ thoughtSignature: "signature" }] } }],
    })}\n\n`;
    const textA = '{"summary":"ok",';
    const textB = '"patterns":[],"topics_to_discuss":[]}';
    const textFrame = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text: textA }] } }],
    })}\n\n`;
    const stopFrame = `data: ${JSON.stringify({
      candidates: [{ finishReason: "STOP" }],
    })}\n\n`;
    const splitAt = Math.floor(textFrame.length / 2);
    // A distinct text delta after the split proves the frames are reassembled rather than dropped.
    const secondTextFrame = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text: textB }] } }],
    })}\n\n`;
    const fetchMock = vi.fn(async () =>
      sseResponse([
        thoughtFrame + textFrame.slice(0, splitAt),
        textFrame.slice(splitAt) + secondTextFrame + stopFrame,
      ]),
    );
    const deltas: string[] = [];
    const provider = new GeminiAiProvider(config, fetchMock);

    const result = await provider.generateInsight(input, {
      onDelta: (delta) => deltas.push(delta),
    });

    expect(result).toEqual({
      text: `${textA}${textB}`,
      model: "gemini-test",
      provider: "gemini",
    });
    expect(deltas).toEqual([textA, textB]);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call).toBeDefined();
    const [url, init] = call;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse",
    );
    expect(String(url)).not.toContain(config.apiKey);
    expect(init?.headers).toMatchObject({
      "x-goog-api-key": config.apiKey,
      "content-type": "application/json",
    });
    expect(String(init?.body)).toContain(
      '"propertyOrdering":["summary","patterns","topics_to_discuss"]',
    );
  });

  it("maps 429 responses to retryable unavailability", async () => {
    const provider = new GeminiAiProvider(config, vi.fn(async () => sseResponse([], 429)));

    const error = await captureError(provider.generateInsight(input));

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).retryable).toBe(true);
  });

  it("maps other 4xx responses to non-retryable unavailability", async () => {
    const provider = new GeminiAiProvider(config, vi.fn(async () => sseResponse([], 400)));

    const error = await captureError(provider.generateInsight(input));

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).retryable).toBe(false);
  });

  it("maps an abort to a timeout error", async () => {
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const rejectAsAbort = (): void =>
            reject(new DOMException("The operation was aborted", "AbortError"));
          if (signal?.aborted) {
            rejectAsAbort();
            return;
          }
          signal?.addEventListener("abort", rejectAsAbort, { once: true });
        }),
    );
    const provider = new GeminiAiProvider(config, fetchMock);
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(
      provider.generateInsight(input, { signal: controller.signal }),
    );

    expect(error).toBeInstanceOf(AiTimeoutError);
  });
});
