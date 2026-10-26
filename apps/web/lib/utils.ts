/**
 * Small helpers shared by the components. They live in one file so the date rules (a check-in is a
 * calendar day, never an instant) are decided once instead of per component.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LONG_DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const SHORT_DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

/**
 * Builds a local-midnight Date out of an ISO day. Parsing as UTC would move the day for anyone
 * west of Greenwich, so a check-in dated the 7th could be shown as the 6th.
 */
export function parseLocalIsoDate(isoDate: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) {
    return null;
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSpanishDate(isoDate: string): string {
  const parsed = parseLocalIsoDate(isoDate);
  return parsed ? LONG_DATE.format(parsed) : isoDate;
}

export function formatSpanishShortDate(isoDate: string): string {
  const parsed = parseLocalIsoDate(isoDate);
  return parsed ? SHORT_DATE.format(parsed) : isoDate;
}

/** Today's calendar day in the browser's timezone, as `YYYY-MM-DD`. */
export function todayLocalIsoDate(): string {
  const now = new Date();
  const year = `${now.getFullYear()}`;
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compares two ISO calendar days as plain strings.
 *
 * The `YYYY-MM-DD` format sorts lexicographically in the same order it sorts chronologically, so
 * no Date object is needed and no timezone can shift the day.
 */
export function isIsoDateAfter(isoDate: string, otherIsoDate: string): boolean {
  return isoDate > otherIsoDate;
}
