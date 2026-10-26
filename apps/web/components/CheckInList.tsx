import type { CheckIn } from "@maia/contracts";
import { SYMPTOM_LABELS } from "@maia/contracts";
import { formatSpanishDate } from "@/lib/utils";

interface CheckInListProps {
  checkIns: CheckIn[];
}

const METRIC_LABELS: ReadonlyArray<{ key: "wellbeing" | "sleepQuality" | "energy" | "stress"; label: string }> = [
  { key: "wellbeing", label: "Bienestar" },
  { key: "sleepQuality", label: "Sueño" },
  { key: "energy", label: "Energía" },
  { key: "stress", label: "Estrés" },
];

function CheckInItem({ checkIn }: { checkIn: CheckIn }) {
  return (
    <li className="checkin">
      <h3 className="checkin-date">{formatSpanishDate(checkIn.date)}</h3>
      <ul className="checkin-metrics">
        {METRIC_LABELS.map((metric) => (
          <li key={metric.key}>
            <span className="checkin-metric-label">{metric.label}</span>
            <span className="checkin-metric-value">{checkIn[metric.key]}/5</span>
          </li>
        ))}
      </ul>
      {checkIn.symptoms.length > 0 ? (
        <p className="checkin-symptoms">
          <span className="checkin-metric-label">Síntomas:</span>{" "}
          {checkIn.symptoms.map((symptom) => SYMPTOM_LABELS[symptom]).join(", ")}
        </p>
      ) : (
        <p className="checkin-symptoms">
          <span className="checkin-metric-label">Síntomas:</span> Ninguno
        </p>
      )}
      {checkIn.notes ? (
        // Notes are long free text; a collapsed expander keeps the list readable.
        <details className="checkin-notes">
          <summary>Ver notas</summary>
          <p>{checkIn.notes}</p>
        </details>
      ) : null}
    </li>
  );
}

export function CheckInList({ checkIns }: CheckInListProps) {
  if (checkIns.length === 0) {
    return (
      <p className="empty-state">
        Todavía no hay registros. Guarda el primero para empezar a ver tu evolución.
      </p>
    );
  }

  return (
    <ul className="checkin-list">
      {checkIns.map((checkIn) => (
        // The date is unique per user and survives the upsert of a day, so it is a safer key than
        // the id, which changes when the row is rewritten.
        <CheckInItem key={checkIn.date} checkIn={checkIn} />
      ))}
    </ul>
  );
}
