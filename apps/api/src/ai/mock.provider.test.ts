import { describe, expect, it } from "vitest";
import type { CheckInRow } from "../db/schema";
import { assertNonDiagnostic } from "./insight-guardrail";
import { parseInsightOutput } from "./insight-output.parser";
import { MockAiProvider } from "./mock.provider";

function row(date: string, wellbeing: number, sleepQuality: number, energy: number, stress: number): CheckInRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "11111111-1111-4111-8111-111111111111",
    date,
    wellbeing,
    sleepQuality,
    energy,
    stress,
    symptoms: ["fatigue"],
    notes: null,
    createdAt: new Date(`${date}T09:30:00.000Z`),
    updatedAt: new Date(`${date}T09:30:00.000Z`),
  };
}

describe("MockAiProvider", () => {
  it("is deterministic and emits parseable, guardrail-clean insight text", async () => {
    const provider = new MockAiProvider();
    const input = {
      checkIns: [
        row("2025-01-01", 2, 2, 3, 4),
        row("2025-01-05", 3, 3, 4, 3),
        row("2025-01-08", 4, 4, 5, 2),
      ],
      includeNotes: false,
    };
    const deltas: string[] = [];

    const first = await provider.generateInsight(input, { onDelta: (delta) => deltas.push(delta) });
    const second = await provider.generateInsight(input);

    expect(first).toEqual(second);
    expect(first.provider).toBe("mock");
    expect(deltas.join("")).toBe(first.text);

    const content = parseInsightOutput(first.text);
    expect(content.patterns).toHaveLength(2);
    expect(content.topicsToDiscuss).toHaveLength(2);
    expect(() => assertNonDiagnostic(content)).not.toThrow();
  });
});
