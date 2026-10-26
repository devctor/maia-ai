import { Global, Module, type Provider } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  aiConfigFrom,
  appConfigFrom,
  validateEnv,
  type AiConfig,
  type AppConfig,
  type Env,
} from "../config/env";
import { createDatabase, type Database, type DatabaseConnection } from "./database";

export const DATABASE = Symbol("DATABASE");
export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");
export const APP_CONFIG = Symbol("APP_CONFIG");
export const AI_CONFIG = Symbol("AI_CONFIG");
export const ENV = Symbol("ENV");

/**
 * `ConfigModule` loads the file into `process.env`; `validateEnv` owns the rules. Reading it through
 * one provider — instead of `ConfigService` lookups scattered in modules — keeps the schema the
 * single definition of a valid environment, and makes an invalid one fail at boot, not at request.
 */
const envProvider: Provider = {
  provide: ENV,
  useFactory: (): Env => validateEnv(process.env as Record<string, unknown>),
};

const databaseProvider: Provider = {
  provide: DATABASE_CONNECTION,
  inject: [ENV],
  useFactory: (env: Env): DatabaseConnection => createDatabase(env.DATABASE_URL),
};

const databaseHandleProvider: Provider = {
  provide: DATABASE,
  inject: [DATABASE_CONNECTION],
  useFactory: (connection: DatabaseConnection): Database => connection.db,
};

const appConfigProvider: Provider = {
  provide: APP_CONFIG,
  inject: [ENV],
  useFactory: (env: Env): AppConfig => appConfigFrom(env),
};

const aiConfigProvider: Provider = {
  provide: AI_CONFIG,
  inject: [ENV],
  useFactory: (env: Env): AiConfig => aiConfigFrom(env),
};

/**
 * Global so feature modules receive the database handle and the typed config without re-importing
 * the environment everywhere. Values are built once per process.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] })],
  providers: [
    envProvider,
    databaseProvider,
    databaseHandleProvider,
    appConfigProvider,
    aiConfigProvider,
  ],
  exports: [ENV, DATABASE, DATABASE_CONNECTION, APP_CONFIG, AI_CONFIG],
})
export class DatabaseModule {}
