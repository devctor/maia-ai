import { Module } from "@nestjs/common";
import { CheckInsModule } from "./check-ins/check-ins.module";
import { DatabaseModule } from "./db/database.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [DatabaseModule, HealthModule, UsersModule, CheckInsModule],
})
export class AppModule {}
