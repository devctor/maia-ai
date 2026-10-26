import { INSIGHT_WINDOW_SIZE } from "@maia/contracts";
import { describe, expect, it } from "vitest";
import type { CheckInRow } from "../db/schema";
import { buildInsightPrompt } from "./prompt";

function row(day: number, notes: string | null = null): CheckInRow {
  const date = `2025-01-${String(day).padStart(2, "0")}`;

  return {
    id: `00000000-0000-4000-8000-${String(day).padStart(12, "0")}`,
    userId: "11111111-1111-4111-8111-111111111111",
    date,
    wellbeing: 3,
    sleepQuality: 2,
    energy: 4,
    stress: 5,
    symptoms: ["headache"],
    notes,
    createdAt: new Date(`${date}T09:30:00.000Z`),
    updatedAt: new Date(`${date}T09:30:00.000Z`),
  };
}

describe("buildInsightPrompt", () => {
  it("sends only the latest compact records and never identifiers", () => {
    const checkIns = Array.from({ length: INSIGHT_WINDOW_SIZE + 2 }, (_, index) =>
      row(index + 1, "nota privada"),
    );

    const prompt = buildInsightPrompt({ checkIns, includeNotes: false });

    expect(prompt.content.match(/"date":/g)).toHaveLength(INSIGHT_WINDOW_SIZE);
    expect(prompt.content).not.toContain(checkIns[0]?.id ?? "");
    expect(prompt.content).not.toContain(checkIns[0]?.userId ?? "");
    expect(prompt.content).not.toContain("nota privada");
    expect(prompt.content).not.toContain('"notes"');
    expect(prompt.content).toContain('"code":"headache"');
    expect(prompt.content).toContain('"label":"Dolor de cabeza"');
  });

  it("includes notes only when requested and truncates them at 500 characters", () => {
    const prompt = buildInsightPrompt({
      checkIns: [row(1, "n".repeat(600))],
      includeNotes: true,
    });

    expect(prompt.content).toContain('"notes":"' + "n".repeat(500) + '"');
    expect(prompt.content).not.toContain("n".repeat(501));
  });

  it("states the neutral, non-diagnostic contract and exact response keys", () => {
    const prompt = buildInsightPrompt({ checkIns: [row(1)], includeNotes: false });

    expect(prompt.system).toContain('"summary"');
    expect(prompt.system).toContain('"patterns"');
    expect(prompt.system).toContain('"topics_to_discuss"');
    expect(prompt.system).toMatch(/2-4 frases/i);
    expect(prompt.system).toMatch(/2-4 patrones/i);
    expect(prompt.system).toMatch(/1-3 temas/i);
    expect(prompt.system).toMatch(/no diagnostic/i);
  });
});
