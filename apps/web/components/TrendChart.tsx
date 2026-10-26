import type { CheckIn } from "@maia/contracts";
import { formatSpanishShortDate } from "@/lib/utils";

interface TrendChartProps {
  checkIns: CheckIn[];
}

type MetricKey = "wellbeing" | "sleepQuality" | "energy" | "stress";

interface Series {
  key: MetricKey;
  label: string;
  color: string;
}

/**
 * Okabe-Ito palette: the four hues stay distinguishable for the most common colour vision
 * deficiencies, and every series also has its own label and marker, so colour is never the only
 * thing carrying the meaning.
 */
const SERIES: readonly Series[] = [
  { key: "wellbeing", label: "Bienestar", color: "var(--chart-wellbeing)" },
  { key: "sleepQuality", label: "Calidad del sueño", color: "var(--chart-sleep)" },
  { key: "energy", label: "Energía", color: "var(--chart-energy)" },
  { key: "stress", label: "Estrés", color: "var(--chart-stress)" },
];

const WIDTH = 720;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 36, left: 40 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const MAX_X_LABELS = 6;

export function TrendChart({ checkIns }: TrendChartProps) {
  // The API returns the newest day first; a time axis has to grow to the right.
  const points = [...checkIns].sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return (
      <p className="empty-state">
        Con dos o más registros verás aquí la evolución de tus indicadores.
      </p>
    );
  }

  const xFor = (index: number): number =>
    points.length <= 1
      ? PADDING.left + PLOT_WIDTH / 2
      : PADDING.left + (index * PLOT_WIDTH) / (points.length - 1);
  const yFor = (value: number): number =>
    PADDING.top + ((5 - value) * PLOT_HEIGHT) / 4;
  const labelStep = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));

  const first = points[0];
  const last = points[points.length - 1];
  const summary = `Evolución de ${SERIES.length} indicadores en ${points.length} ${points.length === 1 ? "día" : "días"}. ${SERIES.map((series) => {
    const from = first ? first[series.key] : null;
    const to = last ? last[series.key] : null;
    return `${series.label}: de ${from ?? "-"} a ${to ?? "-"}`;
  }).join(". ")}.`;

  return (
    <figure className="chart">
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        preserveAspectRatio="xMidYMid meet"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <g key={value}>
            <line
              className="chart-grid"
              x1={PADDING.left}
              x2={PADDING.left + PLOT_WIDTH}
              y1={yFor(value)}
              y2={yFor(value)}
            />
            <text className="chart-axis-label" x={PADDING.left - 10} y={yFor(value) + 4}>
              {value}
            </text>
          </g>
        ))}

        {SERIES.map((series) => (
          <polyline
            key={series.key}
            data-series={series.key}
            className="chart-line"
            fill="none"
            stroke={series.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points
              .map((point, index) => `${xFor(index)},${yFor(point[series.key])}`)
              .join(" ")}
          />
        ))}

        {SERIES.map((series) =>
          points.map((point, index) => (
            <circle
              key={`${series.key}-${point.date}`}
              className="chart-marker"
              cx={xFor(index)}
              cy={yFor(point[series.key])}
              r={3}
              fill={series.color}
            />
          )),
        )}

        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              key={point.date}
              className="chart-axis-label"
              x={xFor(index)}
              y={HEIGHT - PADDING.bottom + 20}
              textAnchor="middle"
            >
              {formatSpanishShortDate(point.date)}
            </text>
          ) : null,
        )}
      </svg>

      <ul className="chart-legend">
        {SERIES.map((series) => (
          <li key={series.key}>
            <span className="chart-swatch" style={{ background: series.color }} aria-hidden="true" />
            {series.label}
          </li>
        ))}
      </ul>

      {/* The chart is a picture; the table is the data, so nothing is chart-only. */}
      <table className="visually-hidden">
        <caption>Datos del gráfico de evolución</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            {SERIES.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              {SERIES.map((series) => (
                <td key={series.key}>{point[series.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
