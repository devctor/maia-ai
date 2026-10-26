import type { InsightProviderName } from "@maia/contracts";
import type { CheckInRow } from "../db/schema";

/**
 * The seam between business logic and an AI vendor.
 *
 * Everything above this interface speaks in terms of check-ins and text; everything below it knows
 * about HTTP, SSE and API keys. Replacing Gemini with another provider, or with a fake in a test,
 * is an implementation of this interface and nothing else changes.
 */
export interface InsightPromptInput {
  checkIns: CheckInRow[];
  includeNotes: boolean;
}

export interface AiGenerationResult {
  /** The raw model text. It is untrusted: the caller must parse and guard it before persisting. */
  text: string;
  model: string;
  provider: InsightProviderName;
}

export interface AiGenerateOptions {
  signal?: AbortSignal;
  /** Progressive display only. Never treat a delta as the final answer. */
  onDelta?: (delta: string) => void;
}

export interface AiProvider {
  readonly name: InsightProviderName;
  generateInsight(input: InsightPromptInput, options?: AiGenerateOptions): Promise<AiGenerationResult>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
