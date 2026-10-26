import { INSIGHT_WINDOW_SIZE, type CreateCheckInData, type ListCheckInsQuery } from "@maia/contracts";
import { describe, expect, it, vi } from "vitest";
import type { CheckInRow } from "../db/schema";
import type { CheckInsRepository } from "./check-ins.repository";
import { CheckInsService } from "./check-ins.service";

const row: CheckInRow = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "11111111-1111-4111-8111-111111111111",
  date: "2025-01-08",
  wellbeing: 4,
  sleepQuality: 3,
  energy: 4,
  stress: 2,
  symptoms: ["fatigue"],
  notes: null,
  createdAt: new Date("2025-01-08T09:30:00.000Z"),
  updatedAt: new Date("2025-01-08T09:30:00.000Z"),
};

const input: CreateCheckInData = {
  date: "2025-01-08",
  wellbeing: 4,
  sleepQuality: 3,
  energy: 4,
  stress: 2,
  symptoms: ["fatigue"],
  notes: null,
};

describe("CheckInsService", () => {
  it("stores a check-in and returns its contract representation", async () => {
    const upsert = vi.fn(async (_userId: string, _data: CreateCheckInData) => row);
    const repository = { upsert } as unknown as CheckInsRepository;
    const service = new CheckInsService(repository);

    const result = await service.create(row.userId, input);

    expect(upsert).toHaveBeenCalledWith(row.userId, input);
    expect(result.id).toBe(row.id);
    expect(result.symptoms).toEqual(["fatigue"]);
    expect(result.createdAt).toBe("2025-01-08T09:30:00.000Z");
  });

  it("lists recent check-ins with the requested limit", async () => {
    const listRecent = vi.fn(async (_userId: string, _limit: number) => [row]);
    const repository = { listRecent } as unknown as CheckInsRepository;
    const service = new CheckInsService(repository);
    const query: ListCheckInsQuery = { limit: 5 };

    const result = await service.list(row.userId, query);

    expect(listRecent).toHaveBeenCalledWith(row.userId, query.limit);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(row.id);
  });

  it("uses the insight window by default when building context", async () => {
    const listRecent = vi.fn(async (_userId: string, _limit: number) => [row]);
    const repository = { listRecent } as unknown as CheckInsRepository;
    const service = new CheckInsService(repository);

    await expect(service.findRecentForContext(row.userId)).resolves.toEqual([row]);
    expect(listRecent).toHaveBeenCalledWith(row.userId, INSIGHT_WINDOW_SIZE);

    await service.findRecentForContext(row.userId, 3);
    expect(listRecent).toHaveBeenLastCalledWith(row.userId, 3);
  });

  it("counts the check-ins owned by the user", async () => {
    const countByUser = vi.fn(async (_userId: string) => 8);
    const repository = { countByUser } as unknown as CheckInsRepository;
    const service = new CheckInsService(repository);

    await expect(service.count(row.userId)).resolves.toBe(8);
    expect(countByUser).toHaveBeenCalledWith(row.userId);
  });
});
