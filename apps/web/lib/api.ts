import {
  checkInListSchema,
  checkInSchema,
  ERROR_CODES,
  errorResponseSchema,
  insightSchema,
  type CheckIn,
  type CreateCheckInInput,
  type ErrorCode,
  type Insight,
} from "@maia/contracts";
import { z } from "zod";
import { isRecord } from "./utils";

/**
 * The browser-facing API the client calls. It is public by definition: the client calls the API
 * directly, so the URL has to be inlined at build time. The default keeps the app usable with no
 * env file.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * The base URL used by whoever is running this code right now.
 *
 * `API_URL` is a host-facing address, because that is the only kind a browser can use: it resolves
 * on the reader's machine. The server rendering of the page is a different vantage point — under
 * compose it runs inside the web container, where `localhost` is that container and the published
 * host port is not reachable at all. `API_URL_INTERNAL` therefore names the API on whatever network
 * the server lives in, and stays server-side: reading a non-`NEXT_PUBLIC_` variable is inlined into
 * the server bundle only, never shipped to the browser.
 */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL_INTERNAL ?? API_URL;
  }
  return API_URL;
}

/**
 * Every failure the API reports comes in the same envelope, so the UI can switch on a stable code
 * instead of parsing a message it would then have to keep in sync with the backend.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly requestId: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * The shape still comes from the contract, but its `code` enum is rebuilt here.
 *
 * `errorResponseSchema` declares `z.enum(ERROR_CODES)`, and zod's enum expects an array while
 * `ERROR_CODES` is an object, so every parse of that schema throws before it can validate
 * anything. Rebuilding the enum from the very same codes keeps the contract as the source of
 * truth while making the envelope parsable.
 */
const errorEnvelopeSchema = z.object({
  ...errorResponseSchema.shape,
  code: z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]),
});

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiErrorFromPayload(payload: unknown, fallbackStatus: number): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(
      parsed.data.statusCode,
      parsed.data.code,
      parsed.data.message,
      parsed.data.requestId,
      parsed.data.details,
    );
  }
  return new ApiError(
    fallbackStatus,
    "INTERNAL_ERROR",
    `La API respondió con el estado ${fallbackStatus}`,
    "unknown",
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  return toApiErrorFromPayload(await readJson(response), response.status);
}

function contractMismatch(what: string): ApiError {
  return new ApiError(
    500,
    "INTERNAL_ERROR",
    `La respuesta de la API para ${what} no cumple el contrato esperado`,
    "unknown",
  );
}

export async function listCheckIns(limit = 30): Promise<CheckIn[]> {
  const response = await fetch(`${apiBaseUrl()}/check-ins?limit=${limit}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const parsed = checkInListSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw contractMismatch("los registros");
  }
  return parsed.data.items;
}

export async function createCheckIn(input: CreateCheckInInput): Promise<CheckIn> {
  const response = await fetch(`${apiBaseUrl()}/check-ins`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const parsed = checkInSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw contractMismatch("el registro creado");
  }
  return parsed.data;
}

/** The latest stored insight, or `null` when the user has never generated one. */
export async function getLatestInsight(): Promise<Insight | null> {
  const response = await fetch(`${apiBaseUrl()}/insights/latest`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  const parsed = insightSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw contractMismatch("el insight");
  }
  return parsed.data;
}

export interface StreamInsightHandlers {
  includeNotes: boolean;
  /** Raw model text, shown while it arrives. It is never treated as the insight itself. */
  onDelta: (delta: string) => void;
  onInsight: (insight: Insight) => void;
  onError: (error: ApiError) => void;
  signal?: AbortSignal;
}

interface SseFrame {
  event: string;
  data: string;
}

/** Finds the blank line that closes an SSE frame, tolerating both LF and CRLF producers. */
function findFrameEnd(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) {
    return null;
  }
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    return { index: crlf, length: 4 };
  }
  return { index: lf, length: 2 };
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split(/\r\n|\r|\n/)) {
    // Empty lines separate frames and lines starting with ":" are comments/keep-alives.
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  if (event === "message" && data.length === 0) {
    return null;
  }
  return { event, data: data.join("\n") };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Consumes `POST /insights/stream` and turns the raw byte stream into SSE frames.
 *
 * The reader hands out arbitrary chunks, so a frame can arrive split in the middle of a line or
 * in the middle of the blank line that closes it. Everything is buffered until a frame is whole.
 */
export async function streamInsight(handlers: StreamInsightHandlers): Promise<void> {
  const { includeNotes, onDelta, onInsight, onError, signal } = handlers;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/insights/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ includeNotes }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError(503, "AI_UNAVAILABLE", "No se pudo conectar con la API", "unknown");
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (!response.body) {
    throw contractMismatch("el streaming del insight");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const handleFrame = (raw: string): void => {
    const frame = parseFrame(raw);
    if (!frame) {
      return;
    }
    if (frame.event === "token") {
      const payload = parseJson(frame.data);
      if (isRecord(payload) && typeof payload["delta"] === "string") {
        onDelta(payload["delta"]);
      }
      return;
    }
    if (frame.event === "insight") {
      const parsed = insightSchema.safeParse(parseJson(frame.data));
      if (!parsed.success) {
        onError(
          new ApiError(
            502,
            "AI_INVALID_RESPONSE",
            "La respuesta del insight no cumple el contrato esperado",
            "unknown",
          ),
        );
        finished = true;
        return;
      }
      onInsight(parsed.data);
      finished = true;
      return;
    }
    if (frame.event === "error") {
      onError(toApiErrorFromPayload(parseJson(frame.data), 500));
      finished = true;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let frameEnd = findFrameEnd(buffer);
      while (frameEnd !== null) {
        const raw = buffer.slice(0, frameEnd.index);
        buffer = buffer.slice(frameEnd.index + frameEnd.length);
        handleFrame(raw);
        if (finished) {
          return;
        }
        frameEnd = findFrameEnd(buffer);
      }
    }
    // A last frame without its trailing blank line still carries a result.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      handleFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
