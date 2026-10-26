import { Module, type Provider } from "@nestjs/common";
import { AI_CONFIG } from "../db/database.module";
import type { AiConfig } from "../config/env";
import { AI_PROVIDER } from "./ai-provider.interface";
import { GeminiAiProvider } from "./gemini.provider";
import { MockAiProvider } from "./mock.provider";

const aiProvider: Provider = {
  provide: AI_PROVIDER,
  inject: [AI_CONFIG],
  useFactory: (config: AiConfig) =>
    config.provider === "gemini" ? new GeminiAiProvider(config) : new MockAiProvider(),
};

/**
 * Binds the provider interface to one implementation chosen by configuration. Consumers inject
 * `AI_PROVIDER`, so they never import a vendor module and a test can bind a fake in one line.
 */
@Module({
  providers: [aiProvider],
  exports: [AI_PROVIDER],
})
export class AiModule {}
