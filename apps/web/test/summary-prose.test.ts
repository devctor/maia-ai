import { describe, expect, it } from "vitest";
import { extractSummaryProse } from "@/lib/summary-prose";

/**
 * The provider does not stream prose: constrained decoding makes it emit a JSON document, and the
 * `token` events carry fragments of that document. These fixtures are the deltas Gemini actually
 * produced, byte for byte, for one real generation, so the extractor is pinned against the shape it
 * will really see instead of an idealised one.
 */
const REAL_DELTAS = [
  '{\n  "summary": "Durante los últimos',
  " dos días, los niveles de bienestar, calidad del sueño, energía y estrés se han mantenido constantes. No se han report",
  'ado síntomas adicionales en este periodo.",\n  "patterns": [\n    "Estabilidad en los indicadores de bienestar y energía',
  '",\n    "Calidad del sueño consistente en un nivel bajo",\n    "Niveles de estrés sostenidos"',
  '\n  ],\n  "topics_to_discuss": [\n    "Factores que podrían estar influyendo en la calidad',
  ' del sueño",\n    "Estrategias para la gestión del estrés diario"\n  ]\n}',
];

const EXPECTED_PROSE =
  "Durante los últimos dos días, los niveles de bienestar, calidad del sueño, energía y estrés " +
  "se han mantenido constantes. No se han reportado síntomas adicionales en este periodo.";

/** Replays the real deltas, returning what the UI would show after each one. */
function replay(deltas: string[]): string[] {
  let accumulated = "";
  return deltas.map((delta) => {
    accumulated += delta;
    return extractSummaryProse(accumulated);
  });
}

describe("extractSummaryProse", () => {
  it("returns the summary prose that is already complete, never the JSON around it", () => {
    const rendered = replay(REAL_DELTAS);

    // The last frame is the complete document: the extractor must still yield only the prose.
    expect(rendered.at(-1)).toBe(EXPECTED_PROSE);
  });

  it("never renders JSON syntax at any point of the real stream", () => {
    for (const prose of replay(REAL_DELTAS)) {
      expect(prose).not.toContain("{");
      expect(prose).not.toContain("}");
      expect(prose).not.toContain('"summary"');
      expect(prose).not.toContain('"patterns"');
      expect(prose).not.toContain("topics_to_discuss");
    }
  });

  it("grows monotonically, so text never disappears while the answer is arriving", () => {
    const rendered = replay(REAL_DELTAS);

    for (let index = 1; index < rendered.length; index += 1) {
      const previous = rendered[index - 1] ?? "";
      const current = rendered[index] ?? "";
      expect(current.startsWith(previous)).toBe(true);
    }
  });

  it("stops at the closing quote, so later keys never leak into the prose", () => {
    // The second real delta ends mid-sentence; the third one closes the string and opens `patterns`.
    const afterThird = extractSummaryProse(REAL_DELTAS.slice(0, 3).join(""));

    expect(afterThird).toBe(
      "Durante los últimos dos días, los niveles de bienestar, calidad del sueño, energía y estrés " +
        "se han mantenido constantes. No se han reportado síntomas adicionales en este periodo.",
    );
  });

  it("returns an empty string while the summary key has not been reached yet", () => {
    expect(extractSummaryProse("")).toBe("");
    expect(extractSummaryProse("{")).toBe("");
    expect(extractSummaryProse('{\n  "summ')).toBe("");
    expect(extractSummaryProse('{"patterns": [')).toBe("");
  });

  it("decodes the escapes the model uses instead of showing them raw", () => {
    // A summary can contain quotes and newlines, which JSON escapes. They must reach the DOM as
    // real characters: showing `\"` or a literal backslash-n would be a formatting bug of ours.
    expect(extractSummaryProse('{"summary": "Dijo \\"hola\\" y se fue"')).toBe('Dijo "hola" y se fue');
    expect(extractSummaryProse('{"summary": "Línea uno\\nLínea dos"')).toBe("Línea uno\nLínea dos");
    expect(extractSummaryProse('{"summary": "Ruta C:\\\\datos"}')).toBe("Ruta C:\\datos");
    expect(extractSummaryProse('{"summary": "Emoji \\u00e1 y acento"}')).toBe("Emoji á y acento");
  });

  it("drops a trailing escape that is split across two chunks instead of rendering half of it", () => {
    // A chunk boundary can land inside `\"`, and a half-decoded escape would flash a stray backslash.
    const partialBackslash = extractSummaryProse('{"summary": "Dijo \\');
    expect(partialBackslash).toBe("Dijo ");
    expect(partialBackslash).not.toContain("\\");

    const partialUnicode = extractSummaryProse('{"summary": "Acento \\u00');
    expect(partialUnicode).toBe("Acento ");

    const completed = extractSummaryProse('{"summary": "Acento \\u00e1"');
    expect(completed).toBe("Acento á");
  });

  it("tolerates whitespace variants around the key and colon", () => {
    expect(extractSummaryProse('{"summary":"sin espacios"')).toBe("sin espacios");
    expect(extractSummaryProse('{ "summary" :   "con espacios"')).toBe("con espacios");
  });

  it("yields nothing for a document that is not the expected object", () => {
    // Defensive: a provider change or a stray frame must degrade to no text, never to broken output.
    expect(extractSummaryProse("[]")).toBe("");
    expect(extractSummaryProse("null")).toBe("");
    expect(extractSummaryProse("plain text without a summary")).toBe("");
  });
});
