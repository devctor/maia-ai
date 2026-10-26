import {
  INSIGHT_ITEM_MAX_LENGTH,
  INSIGHT_LIST_MAX_ITEMS,
  INSIGHT_SUMMARY_MAX_LENGTH,
  insightContentSchema,
  type InsightContent,
} from "@maia/contracts";
import { AiInvalidResponseError } from "../common/errors";

/**
 * A model returns text, not data. It fences JSON in markdown, wraps it in prose, renames a key or
 * collapses a list into a string. This function is the boundary where that text becomes something
 * the rest of the system may trust.
 *
 * Tolerance policy: repair what is unambiguous (fences, prose, key aliases, string-to-array, empty
 * items, length), and reject what is not (no summary, no JSON at all). Rejecting a repairable answer
 * wastes an expensive call; accepting an unrepairable one corrupts storage.
 */
export function parseInsightOutput(text: string): InsightContent {
  const json = extractJsonObject(stripCodeFences(text));
  if (json === null) {
    throw new AiInvalidResponseError("La respuesta de la IA no contiene un objeto JSON válido");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new AiInvalidResponseError("La respuesta de la IA no es JSON válido");
  }

  if (typeof raw !== "object" || raw === null) {
    throw new AiInvalidResponseError("La respuesta de la IA no es un objeto JSON");
  }

  const source = raw as Record<string, unknown>;
  const summary = truncate(asText(source.summary), INSIGHT_SUMMARY_MAX_LENGTH);
  if (!summary) {
    throw new AiInvalidResponseError("La respuesta de la IA no incluye un resumen utilizable");
  }

  const candidate = {
    summary,
    patterns: normalizeList(source.patterns),
    topicsToDiscuss: normalizeList(
      source.topicsToDiscuss ?? source.topics_to_discuss ?? source.topics,
    ),
  };

  const result = insightContentSchema.safeParse(candidate);
  if (!result.success) {
    throw new AiInvalidResponseError("La respuesta de la IA no cumple el formato esperado");
  }

  // A model-supplied disclaimer is dropped on purpose: the stored disclaimer is the backend's.
  return result.data;
}

function stripCodeFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "");
}

/**
 * Returns the outermost balanced object. Counting braces instead of using a regex keeps nested
 * objects and braces inside strings from truncating the payload.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const text = truncate(asText(item), INSIGHT_ITEM_MAX_LENGTH);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
    if (result.length === INSIGHT_LIST_MAX_ITEMS) {
      break;
    }
  }

  return result;
}

/**
 * Cuts at a word boundary when one is close enough, so a truncated item stays readable.
 *
 * The cut is anchored to the END of the item, not to the first N characters: two long items that
 * differ only at their tail would otherwise both collapse into the same prefix, and the caller's
 * deduplication would silently drop one. A trailing ellipsis keeps that visible to the reader.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const ellipsis = "…";
  const budget = maxLength - ellipsis.length;
  const slice = text.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  // Reject the word boundary only when the space IS the first word boundary: cutting at index 5
  // would leave "Hola…", which is not a summary. Otherwise a hard cut is the honest result.
  const head = lastSpace > 0 && slice.slice(0, lastSpace).includes(" ") ? slice.slice(0, lastSpace) : slice;
  return `${head.trimEnd()}${ellipsis}`;
}
