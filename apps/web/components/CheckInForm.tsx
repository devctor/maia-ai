"use client";

import { useState, type FormEvent } from "react";
import {
  NOTES_MAX_LENGTH,
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  type CheckIn,
  type CreateCheckInInput,
  type Symptom,
} from "@maia/contracts";
import { ApiError, createCheckIn } from "@/lib/api";
import {
  formatSpanishDate,
  isIsoDateAfter,
  isRecord,
  todayLocalIsoDate,
} from "@/lib/utils";

interface CheckInFormProps {
  /** Called after a successful save so the parent can refresh the list without a page reload. */
  onCreated: (checkIn: CheckIn) => void | Promise<void>;
  /**
   * The calendar days that already hold a record.
   *
   * The list arrives from the server, so it covers only the records the API returned. A day older
   * than that list is therefore not known to be taken, and the form lets it through.
   */
  takenDates?: ReadonlySet<string>;
}

type MetricKey = "wellbeing" | "sleepQuality" | "energy" | "stress";

interface MetricValues {
  wellbeing: number | null;
  sleepQuality: number | null;
  energy: number | null;
  stress: number | null;
}

const METRICS: ReadonlyArray<{ key: MetricKey; label: string }> = [
  { key: "wellbeing", label: "Bienestar general" },
  { key: "sleepQuality", label: "Calidad del sueño" },
  { key: "energy", label: "Energía" },
  { key: "stress", label: "Nivel de estrés" },
];

const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Where the slider thumb rests while the metric is still unanswered. It is only a visual
 * placeholder: the metric stays unselected (and out of the payload) until the user moves the
 * thumb or clicks one of the positions.
 */
const NEUTRAL_POSITION = 3;

function emptyMetricValues(): MetricValues {
  return {
    wellbeing: null,
    sleepQuality: null,
    energy: null,
    stress: null,
  };
}

/** Turns the API's `details.issues` into a field -> message map for inline errors. */
function readIssues(details: Record<string, unknown> | undefined): Record<string, string> {
  const issues = details?.["issues"];
  if (!Array.isArray(issues)) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    if (!isRecord(issue)) {
      continue;
    }
    const path = issue["path"];
    const message = issue["message"];
    if (typeof path === "string" && typeof message === "string" && path.length > 0) {
      errors[path] = message;
    }
  }
  return errors;
}

export function CheckInForm({ onCreated, takenDates }: CheckInFormProps) {
  const [date, setDate] = useState<string>(todayLocalIsoDate);
  const [values, setValues] = useState<MetricValues>(emptyMetricValues);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string | null>(null);

  /**
   * The last day the form accepts.
   *
   * A check-in describes a day that already happened, so today is the upper bound. The browser
   * uses it to grey out the days after today in its own calendar.
   */
  const today = todayLocalIsoDate();

  function setMetric(key: MetricKey, value: number): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /**
   * Rejects a date the form does not accept and returns the message to show, if any.
   *
   * The browser already greys out future days in its own calendar, but the value can still arrive
   * from the keyboard or from a typed date, so the same rules are applied here. The check runs on
   * the day the user picked, not on the whole form, so a rejected date never reaches the API.
   */
  function validateDate(candidate: string): string | null {
    if (!candidate) {
      return "Elige una fecha para el registro.";
    }
    if (isIsoDateAfter(candidate, today)) {
      return "No se pueden registrar fechas futuras.";
    }
    if (takenDates?.has(candidate)) {
      return "Ya existe un registro para esa fecha.";
    }
    return null;
  }

  function handleDateChange(nextDate: string): void {
    setDate(nextDate);
    setDateError(validateDate(nextDate));
  }

  function toggleSymptom(symptom: Symptom): void {
    setSymptoms((current) => {
      // "Ninguno" is the absence of symptoms, so it cannot coexist with a real symptom.
      if (symptom === "none") {
        return current.includes("none") ? [] : ["none"];
      }
      const withoutNone = current.filter((item) => item !== "none");
      return withoutNone.includes(symptom)
        ? withoutNone.filter((item) => item !== symptom)
        : [...withoutNone, symptom];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSuccess(null);
    setFormError(null);

    const dateProblem = validateDate(date);
    if (dateProblem) {
      setDateError(dateProblem);
      setFieldErrors({ date: dateProblem });
      setFormError(dateProblem);
      return;
    }
    setDateError(null);

    const { wellbeing, sleepQuality, energy, stress } = values;
    if (wellbeing === null || sleepQuality === null || energy === null || stress === null) {
      const errors: Record<string, string> = {};
      if (wellbeing === null) {
        errors["wellbeing"] = "Selecciona una opción";
      }
      if (sleepQuality === null) {
        errors["sleepQuality"] = "Selecciona una opción";
      }
      if (energy === null) {
        errors["energy"] = "Selecciona una opción";
      }
      if (stress === null) {
        errors["stress"] = "Selecciona una opción";
      }
      setFieldErrors(errors);
      setFormError("Completa los cuatro indicadores para guardar el registro.");
      return;
    }

    const payload: CreateCheckInInput = {
      date,
      wellbeing,
      sleepQuality,
      energy,
      stress,
      symptoms,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    };

    setSubmitting(true);
    setFieldErrors({});
    try {
      const created = await createCheckIn(payload);
      setSuccess(`Registro guardado para el ${formatSpanishDate(created.date)}.`);
      setDate(todayLocalIsoDate());
      setValues(emptyMetricValues());
      setSymptoms([]);
      setNotes("");
      setFieldErrors({});
      setDateError(null);
      await onCreated(created);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFieldErrors(readIssues(error.details));
      } else {
        setFormError("No se pudo guardar el registro. Inténtalo de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="checkin-date">Fecha del registro</label>
        <input
          id="checkin-date"
          name="date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => handleDateChange(event.target.value)}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? "checkin-date-error" : undefined}
        />
        {dateError ? (
          <p className="field-error" id="checkin-date-error">
            {dateError}
          </p>
        ) : null}
        {takenDates && takenDates.size > 0 ? (
          <p className="hint">
            {takenDates.size === 1
              ? "Ya hay 1 día registrado. Elige otra fecha para añadir un registro nuevo."
              : `Ya hay ${takenDates.size} días registrados. Elige otra fecha para añadir un registro nuevo.`}
          </p>
        ) : null}
      </div>

      {METRICS.map((metric) => {
        const errorId = `checkin-${metric.key}-error`;
        const inputId = `checkin-${metric.key}-slider`;
        const selected = values[metric.key];
        return (
          <fieldset className="field" key={metric.key}>
            <legend>{metric.label} (1 = muy bajo, 5 = muy alto)</legend>
            <div className="scale">
              <input
                id={inputId}
                className={selected === null ? "scale-range scale-range--empty" : "scale-range"}
                name={metric.key}
                type="range"
                min={1}
                max={5}
                step={1}
                value={selected ?? NEUTRAL_POSITION}
                onChange={(event) => setMetric(metric.key, Number(event.target.value))}
                /* Clicking the track where the thumb already rests changes no value, so the
                 * click itself is what turns the neutral placeholder into an answer. */
                onClick={(event) => setMetric(metric.key, Number(event.currentTarget.value))}
                aria-label={metric.label}
                aria-valuetext={selected === null ? "Sin seleccionar" : `${selected} de 5`}
                aria-invalid={fieldErrors[metric.key] ? true : undefined}
                aria-describedby={fieldErrors[metric.key] ? errorId : undefined}
              />
              <div className="scale-ticks">
                {SCALE_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="scale-tick"
                    style={{ left: `${((value - 1) / (SCALE_VALUES.length - 1)) * 100}%` }}
                    aria-label={`${metric.label}: valor ${value}`}
                    aria-pressed={selected === value}
                    onClick={() => setMetric(metric.key, value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="scale-value" aria-live="polite">
                {selected === null ? "Sin seleccionar" : `${selected} de 5`}
              </p>
            </div>
            {fieldErrors[metric.key] ? (
              <p className="field-error" id={errorId}>
                {fieldErrors[metric.key]}
              </p>
            ) : null}
          </fieldset>
        );
      })}

      <fieldset className="field">
        <legend>Síntomas</legend>
        <div className="symptoms">
          {SYMPTOM_CODES.map((symptom) => {
            const inputId = `checkin-symptom-${symptom}`;
            return (
              <span className="symptom-option" key={symptom}>
                <input
                  id={inputId}
                  name="symptoms"
                  type="checkbox"
                  value={symptom}
                  checked={symptoms.includes(symptom)}
                  onChange={() => toggleSymptom(symptom)}
                />
                <label htmlFor={inputId}>{SYMPTOM_LABELS[symptom]}</label>
              </span>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="checkin-notes">Notas (opcional)</label>
        <textarea
          id="checkin-notes"
          name="notes"
          rows={4}
          value={notes}
          maxLength={NOTES_MAX_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          aria-describedby="checkin-notes-counter"
        />
        <p className="hint" id="checkin-notes-counter">
          {notes.length}/{NOTES_MAX_LENGTH} caracteres
        </p>
        {fieldErrors["notes"] ? <p className="field-error">{fieldErrors["notes"]}</p> : null}
      </div>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {success ? (
        <p className="form-success" role="status">
          {success}
        </p>
      ) : null}

      <button className="button" type="submit" disabled={submitting}>
        {submitting ? "Guardando…" : "Guardar registro"}
      </button>
    </form>
  );
}
