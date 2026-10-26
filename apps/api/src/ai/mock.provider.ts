import type {
  AiGenerateOptions,
  AiGenerationResult,
  AiProvider,
  InsightPromptInput,
} from "./ai-provider.interface";

/**
 * Offline provider: deterministic, no network, no API key.
 *
 * This exists so the project runs out of the box and so the whole stack can be exercised in CI
 * without spending quota. It is not a stub that returns fixed text — it derives sentences from the
 * actual records, because that is what makes the UI, the parser and the guardrail testable against
 * realistic input.
 *
 * Determinism matters: given the same records it produces the same text, byte for byte.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = "mock-wellness-v1";

  async generateInsight(
    input: InsightPromptInput,
    options: AiGenerateOptions = {},
  ): Promise<AiGenerationResult> {
    const payload = buildPayload(input);
    const text = JSON.stringify(payload, null, 2);

    // Chunked so a streaming caller exercises the same code path as the real provider.
    const words = text.split(/(?<=\s)/);
    for (const word of words) {
      options.onDelta?.(word);
    }

    return { text, model: this.model, provider: "mock" };
  }
}

interface MockPayload {
  summary: string;
  patterns: string[];
  topics_to_discuss: string[];
}

const METRICS = [
  { key: "wellbeing", label: "bienestar general" },
  { key: "sleepQuality", label: "calidad del sueño" },
  { key: "energy", label: "nivel de energía" },
  { key: "stress", label: "nivel de estrés" },
] as const;

function buildPayload(input: InsightPromptInput): MockPayload {
  const records = [...input.checkIns].sort((a, b) => a.date.localeCompare(b.date));
  const first = records[0];
  const last = records[records.length - 1];

  if (!first || !last) {
    return {
      summary: "No hay registros suficientes para describir una evolución.",
      patterns: [],
      topics_to_discuss: ["Registrar la evolución durante algunos días más."],
    };
  }

  if (records.length === 1) {
    return {
      summary:
        "Con un único registro todavía no se puede describir una evolución. " +
        "El registro muestra los valores de ese día y sirve como punto de partida.",
      patterns: [`Registro inicial del ${first.date} con valores puntuales.`],
      topics_to_discuss: ["Registrar algunos días más para poder comparar."],
    };
  }

  const deltas = METRICS.map((metric) => ({
    ...metric,
    delta: Number(last[metric.key]) - Number(first[metric.key]),
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const changed = deltas.filter((entry) => entry.delta !== 0);
  const description = changed
    .slice(0, 2)
    .map((entry) => `${entry.label} ${entry.delta > 0 ? "subió" : "bajó"} ${Math.abs(entry.delta)} punto(s)`)
    .join(" y ");

  const stable = deltas.find((entry) => entry.delta === 0);
  const window = `${first.date} y ${last.date}`;

  const summary =
    `Entre el ${window} se registraron ${records.length} días de seguimiento. ` +
    (changed.length > 0
      ? `El cambio más claro fue que ${description}. `
      : "Los cuatro indicadores se mantuvieron estables en el periodo. ") +
    (stable ? `El ${stable.label} no cambió en ese intervalo. ` : "") +
    "El resumen describe lo registrado y no interpreta causas.";

  const patterns: string[] = [];
  if (changed[0]) {
    patterns.push(
      changed[0].delta < 0
        ? `Descenso sostenido en ${changed[0].label} a lo largo del periodo.`
        : `Aumento sostenido en ${changed[0].label} a lo largo del periodo.`,
    );
  }
  if (changed[1]) {
    patterns.push(`Variación simultánea en ${changed[1].label}.`);
  }
  if (patterns.length < 2) {
    patterns.push("Registros bastante homogéneos entre días.");
  }

  const highest = [...records]
    .sort((a, b) => b.stress - a.stress)
    .at(0);
  // Symptoms are a distinct signal from the numeric scales, so they only earn a topic when they
  // also appear on the most recent record, not somewhere in the window.
  const symptomsPersist =
    last.symptoms.length > 0 && !last.symptoms.includes("none");

  const topics: string[] = [];
  if (highest && highest.stress >= 4) {
    topics.push("Comentar con un profesional cómo se gestiona el estrés en los días de mayor carga.");
  }
  if (first.sleepQuality <= 2 || last.sleepQuality <= 2) {
    topics.push("Hablar sobre los hábitos de descanso y la calidad del sueño.");
  }
  // Two topics is the target, three is the ceiling. Symptoms only take the third slot: the numeric
  // trend is the primary signal and a full list of topics is harder to act on than a short one.
  if (symptomsPersist && topics.length < 2) {
    topics.push("Revisar con un profesional los síntomas del registro más reciente.");
  }
  // Padded to two topics with distinct sentences, never the same string twice: the parser drops
  // duplicates, so repeating one entry would silently return a single topic.
  if (topics.length < 2) {
    topics.push("Preparar preguntas para la próxima consulta con un profesional de la salud.");
  }
  if (topics.length < 2) {
    topics.push("Anotar qué días del periodo se siente mejor y qué días peor.");
  }

  return { summary, patterns: patterns.slice(0, 4), topics_to_discuss: topics.slice(0, 3) };
}
