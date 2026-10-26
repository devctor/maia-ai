import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { loadEnvFile } from "./config/load-env";
import { validateEnv } from "./config/env";
import type { DatabaseConnection } from "./db/database";
import { DATABASE_CONNECTION } from "./db/database.module";

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const env = validateEnv(process.env as Record<string, unknown>);

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST"],
    allowedHeaders: ["content-type", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    credentials: false,
  });
  // The pool must go down with the process, otherwise a restart leaks connections until Postgres
  // refuses new ones.
  const connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().on("close", () => {
    void connection.close();
  });

  await app.listen(env.API_PORT, "0.0.0.0");
  new Logger("Bootstrap").log(
    `API listening on :${env.API_PORT} (ai=${env.AI_PROVIDER}, model=${env.GEMINI_MODEL})`,
  );
}

void bootstrap();
