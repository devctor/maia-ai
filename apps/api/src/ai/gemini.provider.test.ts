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

/**
 * Builds a provider whose HTTP response is delivered as raw byte slices.
 *
 * The slices are handed to the provider exactly as the network would hand them, so a boundary can
 * fall inside a line, inside the `data:` prefix, or inside the blank line that closes a frame.
 */
function byteSplitProvider(chunks: string[]): GeminiAiProvider {
  const encoder = new TextEncoder();
  const fetchMock = vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  });
  return new GeminiAiProvider(config, fetchMock);
}

/** One SSE frame carrying a single text delta, terminated the way the provider terminates it. */
function textFrame(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
}

async function collectDeltas(chunks: string[]): Promise<{ text: string; deltas: string[] }> {
  const deltas: string[] = [];
  const provider = byteSplitProvider(chunks);
  const result = await provider.generateInsight(input, {
    onDelta: (delta) => deltas.push(delta),
  });
  return { text: result.text, deltas };
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

  /**
   * The provider reads the body with `getReader()`, which returns arbitrary slices: a frame can be
   * split in the middle of a line, in the middle of the `data:` prefix, or in the middle of the
   * blank line that closes it. Each of those positions is exercised here, because a bug that only
   * appears on one of them would silently truncate a real answer.
   */
  it("reassembles a frame split inside its payload", async () => {
    const frame = textFrame('{"summary":"hola"}');
    const cut = frame.indexOf('"summary') + 3;

    const { text, deltas } = await collectDeltas([frame.slice(0, cut), frame.slice(cut)]);

    expect(text).toBe('{"summary":"hola"}');
    expect(deltas).toEqual(['{"summary":"hola"}']);
  });

  it("reassembles a frame split inside the data prefix", async () => {
    // The boundary lands between `dat` and `a: `, so the reader sees no complete line yet.
    const frame = textFrame("parcial");

    const { text, deltas } = await collectDeltas([frame.slice(0, 3), frame.slice(3)]);

    expect(text).toBe("parcial");
    expect(deltas).toEqual(["parcial"]);
  });

  it("reassembles a frame split inside the blank line that closes it", async () => {
    // The trailing `\n\n` is the frame terminator. Splitting inside it is the boundary most likely
    // to drop a frame entirely, because the reader has a full line but no terminator yet.
    const frame = textFrame("terminador");
    const cut = frame.length - 1;

    const { text, deltas } = await collectDeltas([frame.slice(0, cut), frame.slice(cut)]);

    expect(text).toBe("terminador");
    expect(deltas).toEqual(["terminador"]);
  });

  it("emits deltas in order when one chunk carries several frames", async () => {
    // A slow network batches frames; the reader must still surface them one by one, in order.
    const chunks = [textFrame("uno") + textFrame("dos") + textFrame("tres")];

    const { text, deltas } = await collectDeltas(chunks);

    expect(text).toBe("unodos tres".replace(" ", ""));
    expect(deltas).toEqual(["uno", "dos", "tres"]);
  });

  it("decodes a multi-byte character split across chunks without corrupting it", async () => {
    // `decode(value, { stream: true })` exists for exactly this: a UTF-8 sequence cut in half must
    // not become a replacement character, which would corrupt Spanish accents in the summary.
    const frame = textFrame("días de sueño");
    const encoder = new TextEncoder();
    const bytes = encoder.encode(frame);
    const accentIndex = frame.indexOf("í");
    const accentByteStart = encoder.encode(frame.slice(0, accentIndex)).length;
    // Cut one byte into the two-byte `í`, so neither half is valid on its own.
    const cut = accentByteStart + 1;

    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      });
      return new Response(body, { status: 200 });
    });
    const provider = new GeminiAiProvider(config, fetchMock);
    const deltas: string[] = [];

    const result = await provider.generateInsight(input, {
      onDelta: (delta) => deltas.push(delta),
    });

    expect(result.text).toBe("días de sueño");
    expect(deltas).toEqual(["días de sueño"]);
    expect(result.text).not.toContain("\uFFFD");
  });

  it("does not emit a delta for a malformed frame, but keeps the ones already emitted", async () => {
    // One corrupt frame from the provider must not discard the text that already arrived.
    const chunks = [textFrame("bueno"), "data: {esto no es json}\n\n", textFrame("otro")];

    const { text, deltas } = await collectDeltas(chunks);

    expect(text).toBe("buenootro");
    expect(deltas).toEqual(["bueno", "otro"]);
  });

  it("keeps a final frame that arrives without its trailing blank line", async () => {
    // Dropping it would truncate the JSON, and the parser would then reject an answer that was
    // actually complete.
    const truncatedTerminator = textFrame('{"summary":"fin"}').trimEnd();

    const { text, deltas } = await collectDeltas([truncatedTerminator]);

    expect(text).toBe('{"summary":"fin"}');
    expect(deltas).toEqual(['{"summary":"fin"}']);
  });

  it("ignores keep-alive comments and non-data lines", async () => {
    // Proxies inject `:` comments to hold the connection open. They carry no payload and must not
    // be mistaken for a delta or for the end of the stream.
    const chunks = [
      ": keep-alive\n\n",
      `event: message\n${textFrame("real")}`,
      ": otro keep-alive\n\n",
    ];

    const { text, deltas } = await collectDeltas(chunks);

    expect(text).toBe("real");
    expect(deltas).toEqual(["real"]);
  });

  it("fails as retryable when the provider sends no usable text", async () => {
    // Only keep-alives: nothing to show the user. Surfacing it as retryable is what lets
    // `withRetries` try again instead of the client seeing an empty insight.
    const provider = byteSplitProvider([": keep-alive\n\n"]);

    const error = await captureError(provider.generateInsight(input));

    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as AiUnavailableError).retryable).toBe(true);
  });
});
