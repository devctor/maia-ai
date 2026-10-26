import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  createCheckInSchema,
  listCheckInsQuerySchema,
  type CheckIn,
  type CheckInList,
  type CreateCheckInData,
  type ListCheckInsQuery,
} from "@maia/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "../users/users.service";
import { CheckInsService } from "./check-ins.service";

@Controller("check-ins")
export class CheckInsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly checkInsService: CheckInsService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCheckInSchema)) body: CreateCheckInData,
  ): Promise<CheckIn> {
    const user = await this.usersService.getDemoUser();
    return this.checkInsService.create(user.id, body);
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listCheckInsQuerySchema)) query: ListCheckInsQuery,
  ): Promise<CheckInList> {
    const user = await this.usersService.getDemoUser();
    return this.checkInsService.list(user.id, query);
  }
}
