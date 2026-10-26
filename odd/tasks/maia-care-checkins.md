# Maia Care — check-ins + AI insight monorepo

pnpm monorepo (Next.js, NestJS, PostgreSQL, Drizzle, Gemini streaming) for the Maia Care technical case.
Deliverable: working app, runnable with or without an AI API key, plus a README that defends every decision.

## Specs

- **S1** Stack and shape — "pnpm monorepo", `apps/api` (NestJS, traditional layered architecture: controller → service → repository), `apps/web` (Next.js), `packages/contracts` (shared Zod schemas + DTO types), Postgres 17 via docker compose. No Turborepo, no clean/hexagonal/DDD ceremony, no microservices.
- **S2** Registros — "Crear un registro", "Consultar los registros anteriores". A check-in holds: `date` (ISO day, unique per user), `wellbeing` 1..5, `sleepQuality` 1..5, `energy` 1..5, `stress` 1..5, `symptoms` (string[] from a closed catalog), `notes` (free text, optional, max 1000). Creating a second check-in for the same day updates it (idempotent upsert) instead of duplicating the day.
- **S3** Insight con IA — "Generar un insight a partir de los últimos registros", "Visualizar el insight generado". Structured response `{ "summary": string, "patterns": string[], "topics_to_discuss": string[], "disclaimer": string }`. The insight is persisted with the exact check-in IDs used to build it (many-to-many join table).
- **S4** Non-diagnostic contract — "la IA no debe realizar diagnósticos médicos ni presentar sus resultados como tales". The prompt forbids diagnosis; the response must pass a deterministic guard (forbidden diagnostic phrases) before persistence; a rejected response is retried once, then fails with `AI_GUARDRAIL_REJECTED`. The stored insight always carries a fixed disclaimer owned by the backend, never by the model.
- **S5** Malformed provider output — "la respuesta de un sistema externo puede llegar incompleta o en un formato inválido". Provider output is validated with Zod: JSON extraction (fences / prose), coercion of `patterns` and `topics_to_discuss` from string to array, trimming, dropping empty items, capping list lengths, hard failure only when `summary` is unusable.
- **S6** Separation of concerns — "Separación entre lógica de negocio, acceso a datos e integración con IA". `AiProvider` interface + `GeminiAiProvider` (streaming SSE) + `MockAiProvider`; business rules in services; SQL only in repositories; no provider import inside controllers or repositories.
- **S7** Validation and errors — "Validación de los datos de entrada y manejo razonable de errores". Zod at the boundary; uniform error envelope `{ statusCode, code, message, details?, requestId }`; codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `INSUFFICIENT_DATA` (422 when fewer than 2 check-ins), `AI_UNAVAILABLE` (503), `AI_GUARDRAIL_REJECTED` (422), `AI_INVALID_RESPONSE` (502), `CONFLICT` (409), `INTERNAL_ERROR` (500).
- **S8** Streaming — "Generación asíncrona o streaming de los insights". `POST /insights/stream` (SSE) emits `event: token` with raw deltas, then `event: insight` with the final validated payload, or `event: error` with the same code the JSON endpoint would return. The stream never emits unvalidated tokens as if they were the insight.
- **S9** Retries — "Reintentos ante errores del proveedor de IA". Retries only on transient failures (429, 5xx, network, timeout), exponential backoff with jitter, bounded attempts, `AbortController` timeout. 4xx other than 429 are not retried.
- **S10** Testing — "Incluye tests de las partes que consideres más importantes y explica en el README por qué las has elegido". Unit tests for the AI validation/guard/retry layer (fake provider, no network), service tests with a fake repository (business rules), and API e2e tests against a real Postgres with the AI provider overridden. No network in the default test run.
- **S11** Docker — "Docker, CI/CD o despliegue en la nube". `docker compose up` starts Postgres + API + web, runs migrations on start, serves the app on a single documented port.
- **S12** Gráfico — "Gráficos de evolución de los registros". Client-side chart of the four numeric metrics over the recent check-ins. No chart library beyond what is necessary.
- **S13** README — sections required by the PRD: how to run, architecture and decisions, AI integration (what data is sent and how the response is validated), privacy and security, what to improve with more time.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1 | Scaffold monorepo: root configs, Dockerfile bases, compose with Postgres | inline |
| T2 | S1, S7 | `packages/contracts`: Zod schemas, DTOs, error codes, error envelope | inline |
| T3 | S1, S6 | API skeleton + Drizzle schema, migration, db module, config, error filter, request id | inline |
| T4 | S2, S6, S7 | Users + check-ins repository/service/controller with validation and upsert semantics | worker A |
| T5 | S3–S6, S9 | AI layer: provider interface, Gemini streaming provider, mock, JSON extraction/coercion, guardrail, retry policy — with unit tests | worker B |
| T6 | S3, S6, S7, S8 | Insights service (context building, persistence + provenance), JSON endpoint, SSE endpoint | worker C |
| T7 | S12 | Web: check-in form, list, chart, insight generation with streaming display | worker D |
| T8 | S10 | Test suite: contracts, AI layer, services, e2e; wire pnpm scripts | inline |
| T9 | S11 | Docker images for api/web, compose wiring, migration on start | inline |
| T10 | S13 | README with the five required sections | inline |
| T11 | S10 | Final verification: typecheck, lint, full suite, real Gemini smoke | verifier |

## Log

- L1 (verbatim user request): "Necesito completar todo lo que esta en @PRD.md el stack es nextjs, nestjs, postgress, drizzle, gemini provider con streaming, pnpm, docker, monorepo. No quiero arquitecturas complejas solo codigo bien ordenado y escalable, en el back por ejmplo usa una arquitectura de capas tradicional. Tienes poco tiempo esto debe ser defendible en una entrevista tecnica."
- L2 (decision): optional scope = retries + streaming + Docker + chart; no auth. Git initialized with per-unit commits.
- L3 (evidence): Gemini API key available in the environment; `gemini-3.1-flash-lite` verified to support `streamGenerateContent?alt=sse` together with `responseMimeType: application/json` + `responseJsonSchema` (strict). Default model: `gemini-3.1-flash-lite`.
