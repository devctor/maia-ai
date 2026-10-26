import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CheckInsModule } from "../check-ins/check-ins.module";
import { UsersModule } from "../users/users.module";
import { InsightsController } from "./insights.controller";
import { InsightsRepository } from "./insights.repository";
import { InsightsService } from "./insights.service";

@Module({
  imports: [AiModule, CheckInsModule, UsersModule],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsRepository],
  exports: [InsightsService],
})
export class InsightsModule {}
