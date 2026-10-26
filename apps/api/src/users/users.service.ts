import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/env";
import { APP_CONFIG } from "../db/database.module";
import type { UserRow } from "../db/schema";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(
    @Inject(APP_CONFIG) private readonly appConfig: AppConfig,
    private readonly usersRepository: UsersRepository,
  ) {}

  getDemoUser(): Promise<UserRow> {
    return this.usersRepository.ensureDemoUser(this.appConfig.demoUser);
  }
}
