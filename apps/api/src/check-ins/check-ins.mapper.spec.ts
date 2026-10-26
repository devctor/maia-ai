import { describe, expect, it } from "vitest";
import type { CheckInRow } from "../db/schema";
import { toCheckInDto } from "./check-ins.mapper";

const row: CheckInRow = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "11111111-1111-4111-8111-111111111111",
  date: "2025-01-08",
  wellbeing: 4,
  sleepQuality: 3,
  energy: 4,
  stress: 2,
  symptoms: ["fatigue", "insomnia"],
  notes: "Mejoré después de descansar.",
  createdAt: new Date("2025-01-08T09:30:00.000Z"),
  updatedAt: new Date("2025-01-08T12:45:00.000Z"),
};

describe("toCheckInDto", () => {
  it("maps a database row to the shared contract shape", () => {
    expect(toCheckInDto(row)).toEqual({
      id: row.id,
      userId: row.userId,
      date: row.date,
      wellbeing: row.wellbeing,
      sleepQuality: row.sleepQuality,
      energy: row.energy,
      stress: row.stress,
      symptoms: ["fatigue", "insomnia"],
      notes: row.notes,
      createdAt: "2025-01-08T09:30:00.000Z",
      updatedAt: "2025-01-08T12:45:00.000Z",
    });
  });
});
