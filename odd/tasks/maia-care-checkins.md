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
| T12 | S7 | Harden the error envelope: extract a single `describeError`/`toErrorResponse` translation, stop forwarding 5xx `HttpException` payloads, normalise non-`Error` throws before logging, drop the Express request augmentation, reuse the translation in the SSE endpoint, and add the guarded `DiagnosticsController` that makes these guarantees observable | inline |
| T13 | S2, S12 | Serve the API to the caller that is asking: `apiBaseUrl()` picks `API_URL_INTERNAL` when rendering on the server, the API-down notice names the attempted address, and compose keeps a stable service name with `extra_hosts: localhost:host-gateway` | inline |

## Log

- L1 (verbatim user request): "Necesito completar todo lo que esta en @PRD.md el stack es nextjs, nestjs, postgress, drizzle, gemini provider con streaming, pnpm, docker, monorepo. No quiero arquitecturas complejas solo codigo bien ordenado y escalable, en el back por ejmplo usa una arquitectura de capas tradicional. Tienes poco tiempo esto debe ser defendible en una entrevista tecnica."
- L2 (decision): optional scope = retries + streaming + Docker + chart; no auth. Git initialized with per-unit commits.
- L3 (evidence): Gemini API key available in the environment; `gemini-3.1-flash-lite` verified to support `streamGenerateContent?alt=sse` together with `responseMimeType: application/json` + `responseJsonSchema` (strict). Default model: `gemini-3.1-flash-lite`.
- L4 (verbatim user request): "Para los errores de la api usaremos exeption filters"
- L5 (evidence): the exception filter already existed and was already global (`main.ts:19`); disabling it fails 10 of 22 e2e tests, so "adopt filters" was already true. The real defect: `describe()` forwarded any `HttpException` payload string verbatim, so a 5xx wrapping a driver error would ship a connection string to the client. Confirmed by a differential probe against the base commit (5xx leaked `postgresql://maia:super-secret@db:5432/maia_care`; now `Ocurrió un error inesperado`). No test covered that branch.
- L6 (verbatim user decision): "A" — harden the filter instead of leaving it as-is.
- L7 (evidence): RED observed on 4 new e2e cases before the fix, GREEN after. Final: 15 contracts + 23 API unit + 27 API e2e + 22 web = 87 tests, typecheck and lint clean.
- L8 (verbatim user request): "cuando termines pon los cambios hechos aqui en un commit aparte"
- L9 (verbatim user report): "Luego del cambio de ui la evolucion y registros o linea de tiempo no se muestran"
- L10 (evidence): the UI change was not the cause. Reproduced with the stack up: `docker compose ps` healthy, `GET localhost:3001/check-ins` returns 2 records, yet `GET localhost:3000/` renders the API-down notice with an empty timeline and no chart. Inside the web container `fetch('http://localhost:3001/health')` fails with `ECONNREFUSED` in every form (`localhost`, `127.0.0.1`, `::1`), while `http://api:3001/health` and `http://172.24.0.1:3001/health` both answer 200. The page is server-rendered and the server was asking the browser's address, so the sections that need records were always empty. The same shell served from the host against the same build renders 2 timeline entries, the 4-series chart and the insight, which isolates the failure to the address and not to the markup.
- L11 (evidence): a second latent defect found while reading compose. `api` published `${API_PORT:-3001}` but let the container listen on the inherited `API_PORT`, which `.env` also sets; changing that value in one place would have moved the listener away from the healthcheck and from `localhost:3001` on the host.
- L12 (verbatim user decision, option "Config de compose + verificación"): authorize the compose fix (stable `hostname: api`, container `API_PORT: 3001`, `extra_hosts: localhost:host-gateway`, `API_URL_INTERNAL`), the diagnostic notice and a real stack verification.
- L13 (evidence): RED observed before the fix on the new `apiBaseUrl` case (server path resolved `http://localhost:3001`), GREEN after. Final: 15 contracts + 23 API unit + 27 API e2e + 24 web = 89 tests, typecheck and lint clean. Stack rebuilt: page serves 2 timeline entries, 4 chart series, the insight and the four averages; `api:3001` answers 200 from the web container and `localhost:3001` answers 200 with CORS for `http://localhost:3000` from the host.
