"use client";

import { useRef, useState } from "react";
import { INSIGHT_LIST_MAX_ITEMS, type ErrorCode, type Insight } from "@maia/contracts";
import { ApiError, isAbortError, streamInsight } from "@/lib/api";
import { Disclaimer } from "./Disclaimer";

interface InsightPanelProps {
  initialInsight?: Insight | null;
}

type Status = "idle" | "streaming" | "done" | "error";

/** One actionable sentence per machine code. The UI never has to parse a message to react. */
const ERROR_COPY: Partial<Record<ErrorCode, string>> = {
  INSUFFICIENT_DATA:
    "Registra al menos 2 días de seguimiento antes de generar un insight.",
  AI_UNAVAILABLE:
    "El servicio de IA no está disponible ahora. Espera unos segundos e inténtalo de nuevo.",
  AI_TIMEOUT:
    "El servicio de IA tardó demasiado en responder. Inténtalo de nuevo en unos minutos.",
  AI_GUARDRAIL_REJECTED:
    "La respuesta no cumplió las reglas de seguridad y no se generó el insight.",
  AI_INVALID_RESPONSE:
    "La respuesta del servicio no tuvo el formato esperado. Inténtalo de nuevo.",
};

function describeError(error: ApiError): string {
  return ERROR_COPY[error.code] ?? error.message;
}

export function InsightPanel({ initialInsight = null }: InsightPanelProps) {
  const [status, setStatus] = useState<Status>(initialInsight ? "done" : "idle");
  const [insight, setInsight] = useState<Insight | null>(initialInsight);
  const [rawText, setRawText] = useState<string>("");
  const [error, setError] = useState<ApiError | null>(null);
  const [cancelled, setCancelled] = useState<boolean>(false);
  const [includeNotes, setIncludeNotes] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleGenerate(): Promise<void> {
    setStatus("streaming");
    setRawText("");
    setError(null);
    setCancelled(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamInsight({
        includeNotes,
        signal: controller.signal,
        onDelta: (delta) => setRawText((current) => current + delta),
        onInsight: (next) => {
          setInsight(next);
          setStatus("done");
        },
        onError: (apiError) => {
          setError(apiError);
          setStatus("error");
        },
      });
    } catch (thrown) {
      if (isAbortError(thrown)) {
        setCancelled(true);
        setStatus("idle");
        return;
      }
      if (thrown instanceof ApiError) {
        setError(thrown);
      } else {
        setError(new ApiError(500, "INTERNAL_ERROR", "No se pudo generar el insight.", "unknown"));
      }
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel(): void {
    abortRef.current?.abort();
  }

  return (
    <section className="panel insight-panel">
      <h2>Insight con IA</h2>
      <p className="hint">
        El insight se construye con tus últimos registros. No es un diagnóstico ni sustituye la
        opinión de un profesional.
      </p>

      <div className="field field-inline">
        <input
          id="include-notes"
          type="checkbox"
          checked={includeNotes}
          onChange={(event) => setIncludeNotes(event.target.checked)}
        />
        <label htmlFor="include-notes">Incluir mis notas en el análisis</label>
      </div>
      <p className="hint">
        Las notas pueden contener texto sensible y solo se envían al modelo cuando activas esta
        opción.
      </p>

      <div className="actions">
        <button className="button" type="button" onClick={() => void handleGenerate()} disabled={status === "streaming"}>
          Generar insight
        </button>
        {status === "streaming" ? (
          <button className="button button-secondary" type="button" onClick={handleCancel}>
            Cancelar
          </button>
        ) : null}
      </div>

      {status === "streaming" ? (
        <div className="stream" role="status" aria-live="polite">
          <p className="stream-status">generando…</p>
          {/* Raw model text: rendered as plain text, never as HTML. */}
          <pre className="stream-text">{rawText}</pre>
        </div>
      ) : null}

      {cancelled ? (
        <p className="hint" role="status">
          Generación cancelada.
        </p>
      ) : null}

      {status === "error" && error ? (
        <p className="form-error" role="alert">
          {describeError(error)}
        </p>
      ) : null}

      {status === "done" && insight ? (
        <article className="insight">
          <h3>Resumen</h3>
          <p className="insight-summary">{insight.summary}</p>

          <h4>Patrones observados</h4>
          {insight.patterns.length > 0 ? (
            <ul className="insight-list">
              {insight.patterns.slice(0, INSIGHT_LIST_MAX_ITEMS).map((pattern, index) => (
                <li key={`${index}-${pattern}`}>{pattern}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">No se detectaron patrones en estos días.</p>
          )}

          <h4>Temas para comentar con un profesional</h4>
          {insight.topicsToDiscuss.length > 0 ? (
            <ul className="insight-list">
              {insight.topicsToDiscuss.slice(0, INSIGHT_LIST_MAX_ITEMS).map((topic, index) => (
                <li key={`${index}-${topic}`}>{topic}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">No hay temas propuestos para estos días.</p>
          )}

          <p className="footnote">
            Generado con {insight.provider} · {insight.model}
          </p>
          <Disclaimer text={insight.disclaimer} />
        </article>
      ) : null}
    </section>
  );
}
