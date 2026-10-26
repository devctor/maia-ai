import { Injectable } from "@nestjs/common";
import {
  INSIGHT_WINDOW_SIZE,
  type CheckIn,
  type CheckInList,
  type CreateCheckInData,
  type ListCheckInsQuery,
} from "@maia/contracts";
import type { CheckInRow } from "../db/schema";
import { CheckInsRepository } from "./check-ins.repository";
import { toCheckInDto } from "./check-ins.mapper";

@Injectable()
export class CheckInsService {
  constructor(private readonly checkInsRepository: CheckInsRepository) {}

  async create(userId: string, data: CreateCheckInData): Promise<CheckIn> {
    const row = await this.checkInsRepository.upsert(userId, data);
    return toCheckInDto(row);
  }

  async list(userId: string, query: ListCheckInsQuery): Promise<CheckInList> {
    const rows = await this.checkInsRepository.listRecent(userId, query.limit);
    return { items: rows.map(toCheckInDto) };
  }

  findRecentForContext(
    userId: string,
    limit = INSIGHT_WINDOW_SIZE,
  ): Promise<CheckInRow[]> {
    return this.checkInsRepository.listRecent(userId, limit);
  }

  count(userId: string): Promise<number> {
    return this.checkInsRepository.countByUser(userId);
  }
}
