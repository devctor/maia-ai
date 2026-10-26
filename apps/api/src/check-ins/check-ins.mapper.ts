import type { CheckIn, Symptom } from "@maia/contracts";
import type { CheckInRow } from "../db/schema";

/** Single place where a stored row becomes the shape the API promises. */
export function toCheckInDto(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    wellbeing: row.wellbeing,
    sleepQuality: row.sleepQuality,
    energy: row.energy,
    stress: row.stress,
    symptoms: row.symptoms as Symptom[],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
