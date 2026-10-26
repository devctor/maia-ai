import { Logger } from "@nestjs/common";
import type { AiConfig } from "../config/env";
import { AiTimeoutError, AiUnavailableError } from "../common/errors";
import { withRetries } from "./retry";
import { buildInsightPrompt } from "./prompt";
import type {
  AiGenerateOptions,
  AiGenerationResult,
  AiProvider,
  InsightPromptInput,
} from "./ai-provider.interface";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Strict schema for the model's output. Constrained decoding is the cheapest way to get a shape we
 * can parse: it removes whole classes of failure before validation runs. `propertyOrdering` keeps
 * keys in a predictable order, which makes the streamed raw text easier to read as it arrives.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    patterns: { type: "array", items: { type: "string" } },
    topics_to_discuss: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "patterns", "topics_to_discuss"],
  propertyOrdering: ["summary", "patterns", "topics_to_discuss"],
} as const;

/**
 * Google Gemini provider over the streaming endpoint.
 *
 * Written against `fetch` + SSE directly instead of the vendor SDK: the surface used here is one
 * endpoint and three headers, and the retry/timeout/error-mapping policy belongs to us, not to a
 * library that would decide those things differently and change them on a minor release.
 */
export class GeminiAiProvider implements AiProvider {
  readonly name = "gemini" as const;
  private readonly logger = new Logger(GeminiAiProvider.name);

  constructor(
    private readonly config: AiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateInsight(
    input: InsightPromptInput,
    options: AiGenerateOptions = {},
  ): Promise<AiGenerationResult> {
    return withRetries(
      async () => {
        const prompt = buildInsightPrompt(input);
        return this.streamOnce(prompt, input, options);
      },
      {
        maxAttempts: this.config.maxAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
        retryable: (error) =>
          error instanceof AiUnavailableError && error.retryable && !isCallerAbort(error),
      },
    );
  }

  private async streamOnce(
    prompt: { system: string; content: string },
    input: InsightPromptInput,
    options: AiGenerateOptions,
  ): Promise<AiGenerationResult> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.config.timeoutMs);
    // A caller cancellation and our own timeout must both abort the request.
    const onCallerAbort = (): void => timeoutController.abort();
    options.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const response = await this.fetchImpl(
        `${GEMINI_ENDPOINT}/${encodeURIComponent(this.config.model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // The key travels in a header, never in the URL: URLs end up in logs and proxies.
            "x-goog-api-key": this.config.apiKey ?? "",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${prompt.system}\n\n${prompt.content}` }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
              responseJsonSchema: RESPONSE_SCHEMA,
              maxOutputTokens: 1024,
            },
          }),
          signal: timeoutController.signal,
        },
      );

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      const text = await this.readStream(response, options);
      if (options.signal?.aborted) {
        throw new AiTimeoutError("La generación se canceló antes de terminar");
      }

      return { text, model: this.config.model, provider: "gemini" };
    } catch (error) {
      if (error instanceof AiUnavailableError || error instanceof AiTimeoutError) {
        throw error;
      }
      if (options.signal?.aborted) {
        throw new AiTimeoutError("La generación se canceló antes de terminar");
      }
      if (timeoutController.signal.aborted) {
        throw new AiTimeoutError(`La IA no respondió en ${this.config.timeoutMs} ms`);
      }
      // A network failure is transient by nature: surface it as retryable.
      throw new AiUnavailableError(
        `No se pudo contactar al proveedor de IA: ${describe(error)}`,
        true,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * Reads the SSE body. Frames are separated by blank lines, but a chunk boundary can fall anywhere,
   * so lines are buffered and only complete ones are parsed.
   */
  private async readStream(
    response: Response,
    options: AiGenerateOptions,
  ): Promise<string> {
    if (!response.body) {
      throw new AiUnavailableError("El proveedor de IA no devolvió contenido", true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    const flushLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        return;
      }
      const payload = line.slice("data:".length).trim();
      if (payload === "[DONE]") {
        return;
      }
      const delta = extractDelta(payload);
      if (!delta) {
        return;
      }
      text += delta;
      options.onDelta?.(delta);
    };

    const flushBuffer = (): void => {
      if (buffer.trim().length > 0) {
        flushLine(buffer);
      }
      buffer = "";
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        flushLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    }

    // A last frame may arrive without a trailing newline. Dropping it would truncate the output,
    // which the parser would then reject as invalid JSON.
    buffer += decoder.decode();
    flushBuffer();

    if (!text.trim()) {
      throw new AiUnavailableError("El proveedor de IA devolvió una respuesta vacía", true);
    }

    return text;
  }

  private async mapHttpError(response: Response): Promise<AiUnavailableError> {
    const status = response.status;
    let detail = statusText(response);
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) {
        detail = body.error.message;
      }
    } catch {
      // A non-JSON error body adds nothing; the status is what maps to a policy.
    }

    // 429 and 5xx are the provider asking us to come back later. Any other 4xx means our request is
    // wrong (bad key, bad model), and retrying it would only burn quota.
    const retryable = status === 429 || status >= 500;
    this.logger.warn(`Gemini responded ${status} (retryable=${retryable}): ${detail}`);

    return new AiUnavailableError(
      retryable
        ? "El proveedor de IA está temporalmente saturado; inténtalo de nuevo en un momento"
        : "La configuración del proveedor de IA no es válida",
      retryable,
    );
  }
}

function extractDelta(payload: string): string | null {
  try {
    const frame = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thoughtSignature?: string }> } }>;
    };
    const parts = frame.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part) => part.text ?? "")
      .join("");
    return text.length > 0 ? text : null;
  } catch {
    // One malformed frame must not discard the deltas that were already emitted.
    return null;
  }
}

function statusText(response: Response): string {
  return `HTTP ${response.status}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "error desconocido";
}

function isCallerAbort(_error: unknown): boolean {
  return false;
}
