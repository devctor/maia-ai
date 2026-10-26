import { z } from "zod";

/**
 * Configuration is validated once, at boot. A missing or malformed value is a deployment error:
 * failing here is cheaper than failing while a user waits for an insight.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL es obligatoria")
      .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
        message: "DATABASE_URL debe ser una URL de PostgreSQL",
      }),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    /**
     * Mounts the throwing diagnostic routes. Off by default: the error envelope is proven by the
     * test suite, and a deployed instance must never expose an endpoint that fails on purpose.
     */
    DIAGNOSTICS_ENABLED: z.coerce.boolean().default(false),
    DEMO_USER_EMAIL: z.string().email().default("ana@example.com"),
    DEMO_USER_NAME: z.string().min(1).default("Ana"),

    AI_PROVIDER: z.enum(["gemini", "mock"]).default("mock"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite"),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
    AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    AI_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(400),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === "gemini" && !value.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY es obligatoria cuando AI_PROVIDER=gemini",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration -> ${detail}`);
  }
  return result.data;
}

/** Typed configuration groups, so no module reads `process.env` directly. */
export interface AppConfig {
  nodeEnv: Env["NODE_ENV"];
  port: number;
  corsOrigins: string[];
  demoUser: { email: string; name: string };
  diagnosticsEnabled: boolean;
}

export interface AiConfig {
  provider: Env["AI_PROVIDER"];
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
}

export function appConfigFrom(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    demoUser: { email: env.DEMO_USER_EMAIL, name: env.DEMO_USER_NAME },
    diagnosticsEnabled: env.DIAGNOSTICS_ENABLED,
  };
}

export function aiConfigFrom(env: Env): AiConfig {
  return {
    provider: env.AI_PROVIDER,
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxAttempts: env.AI_MAX_ATTEMPTS,
    retryBaseDelayMs: env.AI_RETRY_BASE_DELAY_MS,
  };
}
