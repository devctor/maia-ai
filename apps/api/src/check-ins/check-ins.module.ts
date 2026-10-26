import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { CheckInsController } from "./check-ins.controller";
import { CheckInsRepository } from "./check-ins.repository";
import { CheckInsService } from "./check-ins.service";

@Module({
  imports: [UsersModule],
  controllers: [CheckInsController],
  providers: [CheckInsRepository, CheckInsService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
