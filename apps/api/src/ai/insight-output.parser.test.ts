import {
  INSIGHT_ITEM_MAX_LENGTH,
  INSIGHT_LIST_MAX_ITEMS,
  INSIGHT_SUMMARY_MAX_LENGTH,
} from "@maia/contracts";
import { describe, expect, it } from "vitest";
import { AiInvalidResponseError } from "../common/errors";
import { parseInsightOutput } from "./insight-output.parser";

describe("parseInsightOutput", () => {
  it("parses the contract shape", () => {
    expect(
      parseInsightOutput(
        JSON.stringify({
          summary: " Resumen neutral ",
          patterns: ["Patrón uno", "Patrón dos"],
          topicsToDiscuss: ["Tema uno"],
          disclaimer: "No se conserva",
        }),
      ),
    ).toEqual({
      summary: "Resumen neutral",
      patterns: ["Patrón uno", "Patrón dos"],
      topicsToDiscuss: ["Tema uno"],
    });
  });

  it("extracts fenced and prose-wrapped JSON", () => {
    const fenced = '```json\n{"summary":"Resumen","patterns":[],"topics_to_discuss":[]}\n```';
    const wrapped = 'Antes de continuar: {"summary":"Resumen","patterns":[],"topics":[]} Después.';

    expect(parseInsightOutput(fenced).summary).toBe("Resumen");
    expect(parseInsightOutput(wrapped).summary).toBe("Resumen");
  });

  it("accepts snake-case topics and coerces single strings", () => {
    expect(
      parseInsightOutput(
        JSON.stringify({
          summary: "Resumen",
          patterns: "Un patrón",
          topics_to_discuss: "Un tema",
        }),
      ),
    ).toEqual({
      summary: "Resumen",
      patterns: ["Un patrón"],
      topicsToDiscuss: ["Un tema"],
    });
  });

  it("rejects an unusable summary", () => {
    expect(() =>
      parseInsightOutput(JSON.stringify({ summary: "   ", patterns: [], topics_to_discuss: [] })),
    ).toThrow(AiInvalidResponseError);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseInsightOutput('{"summary":')).toThrow(AiInvalidResponseError);
  });

  it("trims, drops empties, deduplicates, caps and truncates model output", () => {
    // Items differ at the START on purpose. Two items that only differ at the end truncate to the
    // same prefix, and deduplication then drops one — correct behaviour, but it would test the
    // dedupe rule instead of the cap.
    const longItem = (index: number): string => `Patrón ${index}: ${"palabra ".repeat(50)}`;
    const parsed = parseInsightOutput(
      JSON.stringify({
        summary: "s".repeat(INSIGHT_SUMMARY_MAX_LENGTH + 50),
        patterns: [
          "  patrón  ",
          "",
          "patrón",
          ...Array.from({ length: 8 }, (_, index) => longItem(index)),
        ],
        topics_to_discuss: [
          "tema",
          ...Array.from({ length: 8 }, (_, index) => `Tema ${index}: ${"y".repeat(300)}`),
        ],
      }),
    );

    expect(parsed.patterns).toHaveLength(INSIGHT_LIST_MAX_ITEMS);
    expect(parsed.topicsToDiscuss).toHaveLength(INSIGHT_LIST_MAX_ITEMS);
    expect(parsed.patterns[0]).toBe("patrón");
    expect(parsed.patterns[1]?.length).toBeLessThanOrEqual(INSIGHT_ITEM_MAX_LENGTH);
    expect(parsed.summary.length).toBeLessThanOrEqual(INSIGHT_SUMMARY_MAX_LENGTH);
  });
});
