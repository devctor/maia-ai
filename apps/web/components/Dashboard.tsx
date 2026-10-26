"use client";

import { useState } from "react";
import type { CheckIn, Insight } from "@maia/contracts";
import { SYMPTOM_LABELS } from "@maia/contracts";
import { listCheckIns } from "@/lib/api";
import { formatSpanishDate } from "@/lib/utils";
import { CheckInForm } from "./CheckInForm";
import { InsightPanel } from "./InsightPanel";
import { TrendChart } from "./TrendChart";

interface DashboardProps {
  initialCheckIns: CheckIn[];
  initialInsight: Insight | null;
  notice: string | null;
}

type MetricKey = "wellbeing" | "sleepQuality" | "energy" | "stress";

/** The four indicators, in the order the summary and the timeline show them. */
const METRICS: ReadonlyArray<{ key: MetricKey; label: string }> = [
  { key: "wellbeing", label: "Bienestar" },
  { key: "sleepQuality", label: "Sueño" },
  { key: "energy", label: "Energía" },
  { key: "stress", label: "Estrés" },
];

/** Average of a 1..5 scale, or a dash when there is nothing to average yet. */
function average(checkIns: CheckIn[], key: MetricKey): string {
  if (checkIns.length === 0) {
    return "—";
  }
  const total = checkIns.reduce((sum, checkIn) => sum + checkIn[key], 0);
  return (total / checkIns.length).toFixed(1);
}

/** One day of the timeline. The vertical rule and the marker come from the stylesheet. */
function TimelineEntry({ checkIn }: { checkIn: CheckIn }) {
  return (
    <li className="dashboard-entry">
      <span className="dashboard-entry-marker" aria-hidden="true" />
      <p className="dashboard-entry-date">{formatSpanishDate(checkIn.date)}</p>
      <ul className="dashboard-entry-metrics">
        {METRICS.map((metric) => (
          <li className="dashboard-entry-metric" key={metric.key}>
            <span>{metric.label}</span>
            <b>{checkIn[metric.key]}/5</b>
          </li>
        ))}
      </ul>
      <p className="dashboard-entry-symptoms">
        Síntomas:{" "}
        {checkIn.symptoms.length > 0
          ? checkIn.symptoms.map((symptom) => SYMPTOM_LABELS[symptom]).join(", ")
          : "ninguno"}
      </p>
      {checkIn.notes ? (
        <details className="dashboard-entry-notes">
          <summary>Leer las notas de ese día</summary>
          <p>{checkIn.notes}</p>
        </details>
      ) : null}
    </li>
  );
}

/**
 * The home screen: an editorial header with the brand on the left, then two rows of two 50%
 * columns — the check-in form next to the insight panel, the trend chart next to the timeline of
 * records — and the summary of the four indicators spanning the full width at the bottom.
 *
 * The records live in the browser so a new check-in can be saved and the list refreshed without
 * a full page reload. The component is seeded with the data the server already fetched, so the
 * first paint is complete.
 */
export function Dashboard({ initialCheckIns, initialInsight, notice }: DashboardProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [listError, setListError] = useState<string | null>(null);

  async function handleCreated(): Promise<void> {
    try {
      setCheckIns(await listCheckIns());
      setListError(null);
    } catch {
      setListError("No se pudo actualizar la lista de registros.");
    }
  }

  const dayCount = checkIns.length;

  return (
    <div className="dashboard">
      <main className="dashboard-container">
        <header className="dashboard-hero">
          <span className="dashboard-brand">
            <span className="dashboard-logo" aria-hidden="true" />
            Maia Care
          </span>
          <div className="dashboard-hero-copy">
            <p className="dashboard-kicker">Diario de bienestar</p>
            <h1 className="dashboard-display">Registrar es el primer paso para entenderte.</h1>
            <p className="dashboard-lede">
              Cada día anotas cómo te sientes. Con el tiempo, esas anotaciones dejan de ser datos
              sueltos y empiezan a contar una historia: la tuya. Aquí tienes el registro de hoy, la
              línea de tiempo completa y una lectura asistida por IA.
            </p>
          </div>
        </header>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="dashboard-row">
          <section
            className="dashboard-card"
            id="dashboard-registro"
            aria-labelledby="dashboard-title-registro"
          >
            <h2 id="dashboard-title-registro">El registro de hoy</h2>
            <CheckInForm onCreated={handleCreated} />
          </section>

          <section className="dashboard-card">
            <InsightPanel initialInsight={initialInsight} title="Qué dicen tus registros" />
          </section>
        </div>

        <div className="dashboard-row">
          <section className="dashboard-card" aria-labelledby="dashboard-title-evolucion">
            <h2 id="dashboard-title-evolucion">La evolución</h2>
            <figure className="dashboard-figure">
              <TrendChart checkIns={checkIns} />
              <figcaption>
                Los cuatro indicadores a lo largo de tus últimos días. La escala es siempre la
                misma, de 1 a 5.
              </figcaption>
            </figure>
          </section>

          <section className="dashboard-card" aria-labelledby="dashboard-title-timeline">
            <h2 id="dashboard-title-timeline">Línea de tiempo</h2>
            {checkIns.length > 0 ? (
              <ol className="dashboard-timeline">
                {checkIns.map((checkIn) => (
                  <TimelineEntry key={checkIn.date} checkIn={checkIn} />
                ))}
              </ol>
            ) : (
              <p className="empty-state">
                Todavía no hay registros. Guarda el primero para empezar a ver tu evolución.
              </p>
            )}
            {listError ? (
              <p className="form-error" role="alert">
                {listError}
              </p>
            ) : null}
          </section>
        </div>

        <section className="dashboard-summary" aria-labelledby="dashboard-title-resumen">
          <p className="dashboard-eyebrow">Resumen</p>
          <h2 className="dashboard-summary-title" id="dashboard-title-resumen">
            Tu estado en cuatro cifras
          </h2>
          <div className="dashboard-metrics">
            {METRICS.map((metric) => (
              <div className="dashboard-metric" key={metric.key}>
                <span className="dashboard-metric-value">{average(checkIns, metric.key)}</span>
                <span className="dashboard-metric-label">{metric.label}</span>
              </div>
            ))}
          </div>
          <p className="dashboard-summary-note">
            {dayCount === 0
              ? "Todavía no hay registros: el primero pone la escala en marcha."
              : `Media de tus ${dayCount} ${dayCount === 1 ? "registro" : "registros"} sobre una escala de 1 a 5.`}
          </p>
          <a className="dashboard-cta" href="#dashboard-registro">
            Registrar el día de hoy
          </a>
        </section>
      </main>
    </div>
  );
}
