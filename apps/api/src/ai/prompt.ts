import { INSIGHT_WINDOW_SIZE, SYMPTOM_LABELS } from "@maia/contracts";
import type { InsightPromptInput } from "./ai-provider.interface";

/** Notes are capped before leaving the process: a note is free text and can be arbitrarily long. */
const NOTES_MAX_PROMPT_LENGTH = 500;

/**
 * The prompt is a pure function, so what we send to a third party is reviewable in one file and
 * testable without a network.
 *
 * Two decisions worth stating:
 * - Only the most recent window is sent. Sending everything would grow without bound, cost more per
 *   request and expose more of the user's history than the insight needs.
 * - No identifiers travel. The model describes numbers and notes; an email or a user id cannot
 *   improve the output and is the easiest thing to leak.
 */
export function buildInsightPrompt(input: InsightPromptInput): { system: string; content: string } {
  const system = [
    "Eres un asistente de bienestar de Maia Care. A partir de los registros que recibes,",
    "escribes una reflexión breve en español neutro.",
    "",
    "Reglas:",
    "- No diagnosticas. No nombras enfermedades ni medicamentos y no afirmas causas con certeza.",
    "- Describes únicamente lo que los registros muestran, sin inventar datos.",
    "- No recomiendas tratamientos ni dosis; puedes sugerir temas para comentar con un profesional.",
    "",
    "Devuelve exclusivamente un objeto JSON con estas claves:",
    '{"summary": string, "patterns": string[], "topics_to_discuss": string[]}',
    "- summary: 2-4 frases sobre la evolución reciente.",
    "- patterns: 2-4 patrones o cambios observados.",
    "- topics_to_discuss: 1-3 temas que podría ser útil comentar con un profesional sanitario.",
  ].join("\n");

  const window = input.checkIns.slice(0, INSIGHT_WINDOW_SIZE);
  const records = window.map((checkIn) => {
    const record: Record<string, unknown> = {
      date: checkIn.date,
      wellbeing: checkIn.wellbeing,
      sleep_quality: checkIn.sleepQuality,
      energy: checkIn.energy,
      stress: checkIn.stress,
      symptoms: checkIn.symptoms.map((code) => ({
        code,
        label: SYMPTOM_LABELS[code as keyof typeof SYMPTOM_LABELS] ?? code,
      })),
    };

    if (input.includeNotes && checkIn.notes) {
      record.notes = checkIn.notes.slice(0, NOTES_MAX_PROMPT_LENGTH);
    }

    return record;
  });

  const content = [
    `Registros de bienestar (${records.length}, del más reciente al más antiguo):`,
    JSON.stringify(records),
    input.includeNotes
      ? "Las notas libres están incluidas porque la usuaria lo autorizó."
      : "Las notas libres no se incluyen en esta petición.",
  ].join("\n");

  return { system, content };
}
