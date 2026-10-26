import type { InsightContent } from "@maia/contracts";
import { AiGuardrailError } from "../common/errors";

/**
 * Deterministic second line of defence against medical advice.
 *
 * The prompt already forbids diagnosis, and the structured response makes a diagnosis unlikely, but
 * an LLM is not bound by its instructions. This is a heuristic regex guard — cheap, explainable and
 * testable — not a classifier: it catches the explicit and dangerous shapes, and it is documented as
 * a partial control rather than a guarantee.
 *
 * Patterns are accent- and case-insensitive because the model writes Spanish prose, where "Diagnóstico"
 * and "diagnostico" must both be caught.
 */
export const DIAGNOSTIC_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "diagnostico", pattern: /\bdiagnostic\w*/i },
  { name: "tienes_condicion", pattern: /\btienes (un|una|el|la)\w* /i },
  { name: "padeces", pattern: /\bpadeces\b/i },
  { name: "sufres_de", pattern: /\bsufres (de|un|una)\b/i },
  { name: "probable_enfermedad", pattern: /\bes (muy )?probable que (tengas|padezcas|sufras)\b/i },
  { name: "confirma", pattern: /\bconfirma (que|el|la)\b/i },
  { name: "medicacion", pattern: /\b(prescri\w*|medicaci[oó]n|medicamentos?|dosis|pastillas?)/i },
  { name: "tratamiento", pattern: /\btratamiento para\b/i },
  { name: "cura", pattern: /\bcura(r|ci[oó]n)? (la|el|tu|de)\b/i },
  { name: "causa_cierta", pattern: /\b(porque|debido a que) (tienes|padeces|sufres)\b/i },
];

/** Checks the text the user will read: summary and every list item. */
export function assertNonDiagnostic(content: InsightContent): void {
  const texts = [content.summary, ...content.patterns, ...content.topicsToDiscuss];

  for (const text of texts) {
    for (const { pattern } of DIAGNOSTIC_PATTERNS) {
      if (pattern.test(normalize(text))) {
        throw new AiGuardrailError(
          "La respuesta de la IA contenía lenguaje diagnóstico o prescriptivo y fue descartada",
        );
      }
    }
  }
}

/** Folds accents so a pattern matches "padecés", "PADEZCAS" and "padezcas" alike. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
