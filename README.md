# Maia Care — technical case

A small full-stack application where a user records how she feels and receives a structured,
**non-diagnostic wellness insight** based on her recent history.

The goal was not to build the largest solution. It was to make each boundary explicit: what enters
the system, what is persisted, what leaves for an AI provider, what is trusted on return, and what the
user finally sees.

**Stack:** Next.js 15 · NestJS 10 · PostgreSQL 17 · Drizzle · Zod · Gemini · Docker

> Maia Care provides wellness reflections, not medical advice. Generated content is rejected if it
> contains diagnostic or prescriptive language.

## Run it

Requirements: Docker, or Node.js 22+ with pnpm 10.

### Docker — recommended

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. The API runs at <http://localhost:3001> and migrations are applied on
startup.

The default `AI_PROVIDER=mock` works offline and requires no API key. It still exercises the complete
pipeline: generation, parsing, guardrails, persistence, streaming, and rendering.

To use Gemini:

```bash
# .env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

When Gemini is selected without a key, the API fails at startup instead of failing during a user
request.

### Local development

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Useful commands:

```bash
pnpm test       # unit tests; no database or network
pnpm test:e2e   # end-to-end API tests; requires pnpm db:up
```

## The solution in one flow

The requested path is **Registration → Persistence → Analysis → Insight → Visualisation**.

```text
1. Registration
   Next.js form
      ↓ shared Zod contract
   POST /check-ins

2. Persistence
   NestJS controller → service → repository
      ↓ atomic upsert
   PostgreSQL: one check-in per user and calendar day

3. Analysis
   Last 10 check-ins
      ↓ data minimisation
   prompt builder → mock or Gemini provider

4. Insight
   raw model text
      ↓ parse and normalise
      ↓ validate shared schema
      ↓ reject diagnostic language
   transaction: insight + exact source check-in IDs

5. Visualisation
   SSE token events → progressive summary only
   final insight event → trusted structured result
   Next.js card + trends chart
```

This straight path is intentional. Each layer has one responsibility, and external data becomes
trusted only at a visible validation boundary.

## Requirements, mapped to the implementation

| Requirement                  | Implementation                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| Create a record              | `POST /check-ins`; strict validation and an atomic daily upsert             |
| View previous records        | `GET /check-ins`; newest first, rendered on the initial server response     |
| Generate an insight          | JSON and streaming endpoints backed by an injectable AI provider            |
| Show the result              | Progressive summary followed by the validated structured insight            |
| Persist data                 | PostgreSQL with versioned SQL migrations and database constraints           |
| Relate insight to its inputs | `insight_check_ins` stores the exact records used for every insight         |
| Handle invalid AI output     | Constrained generation, parser, Zod schema, and semantic guardrail          |
| Separate responsibilities    | Controller → service → repository, with the AI provider behind an interface |
| Test important behavior      | Contract, parser, safety, retry, HTTP/SQL, SSE, and UI tests                |

## Architecture

```text
apps/
├── api/                         NestJS
│   └── src/
│       ├── check-ins/           controller → service → repository
│       ├── insights/            orchestration and persistence
│       ├── ai/                  provider, prompt, parser, guardrail, retry
│       ├── common/              validation, errors, request IDs
│       ├── config/              environment validation at startup
│       └── db/                  Drizzle schema and migrations
├── web/                         Next.js App Router
└── packages/
    └── contracts/               shared Zod schemas and inferred types
```

### Why this architecture

The backend uses a conventional layered design:

- **Controllers** translate HTTP and validate input.
- **Services** own application rules.
- **Repositories** own SQL and transactions.
- **The AI provider interface** isolates the volatile external dependency.

This is enough structure for the current domain without adding DDD or hexagonal ceremony around a
small application. The abstraction is placed where change is genuinely expected: the AI provider.

`packages/contracts` is the single source of truth for request and response shapes. The API performs
runtime validation with Zod, while the frontend consumes the inferred TypeScript types. A contract
change is therefore visible on both sides during development instead of becoming a browser-time bug.

## Data model

```text
users
  └── check_ins                 UNIQUE (user_id, date)

users
  └── insights
        └── insight_check_ins ── check_ins
```

Key decisions:

1. **A check-in uses a calendar `date`, not a timestamp.** The domain concept is “how I felt that
   day,” independent of timezone.
2. **One record per user per day is enforced by PostgreSQL.** `INSERT ... ON CONFLICT DO UPDATE`
   makes a repeated submission an edit and remains safe under concurrent requests.
3. **Every insight keeps its provenance.** The join table answers which exact check-ins generated a
   result. The insight and its links are written in one transaction.
4. **The database also validates invariants.** Scale ranges, note length, foreign keys, and uniqueness
   do not depend only on application code.

## AI integration: constrain, validate, then trust

### What is sent

Only the last 10 check-ins, most recent first:

- date and the four 1–5 metrics;
- symptom codes with human-readable labels;
- notes only when the user explicitly opts in, truncated to 500 characters.

Email, user IDs, check-in IDs, and other identifying data are never sent. The prompt builder is a pure
function, making the outbound payload easy to review and test.

### Structured response

Gemini is asked for a JSON response shaped as:

```json
{
  "summary": "...",
  "patterns": ["..."],
  "topics_to_discuss": ["..."]
}
```

The request uses both `responseMimeType: application/json` and `responseJsonSchema`. That reduces
malformed output, but provider-side constraints are not treated as proof of correctness.

Every response crosses three gates before persistence:

1. **Parse and normalise.** Remove Markdown fences or surrounding prose, extract balanced JSON,
   accept documented key aliases, trim values, remove duplicates, and apply size limits.
2. **Validate structure.** The normalised result must satisfy the shared `insightContentSchema`.
3. **Validate meaning.** A deterministic guardrail rejects diagnostic or prescriptive language.

The backend owns the disclaimer; the model cannot omit or rewrite a safety requirement. If any gate
fails, nothing is stored.

### Streaming without weakening trust

`POST /insights/stream` emits:

- `token`: partial raw model output, used only to progressively reveal the summary;
- `insight`: the validated, guarded, and persisted final object;
- `error`: the same structured error envelope used by regular JSON endpoints.

Partial JSON is never accepted as domain data. If the client disconnects, the provider request is
aborted so the system does not continue spending time or quota on an abandoned response.

Transient provider failures (`429`, `5xx`, network errors, and timeouts) use bounded exponential
backoff with jitter. Invalid requests and caller cancellations are not retried.

## API

```text
GET  /health                     health and database readiness
GET  /check-ins?limit=30         previous check-ins, newest first
POST /check-ins                  create or update the check-in for a day
POST /insights                   generate an insight as JSON
POST /insights/stream            token* → insight | error
GET  /insights/latest            latest stored insight
```

Example:

```bash
curl -X POST localhost:3001/check-ins \
  -H 'content-type: application/json' \
  -d '{
    "date":"2026-01-05",
    "wellbeing":4,
    "sleepQuality":2,
    "energy":3,
    "stress":5,
    "symptoms":["headache"]
  }'

curl -X POST localhost:3001/insights/stream \
  -H 'content-type: application/json' \
  -d '{"includeNotes":false}'
```

Errors use one stable envelope:

```json
{
  "statusCode": 422,
  "code": "INSUFFICIENT_DATA",
  "message": "...",
  "details": {},
  "requestId": "..."
}
```

The UI reacts to `code`, not message text. Internal `5xx` details remain in logs, while `requestId`
connects a user-visible failure to the corresponding server log.

## Frontend

The initial page is server-rendered with the existing records. Interactive areas—the check-in form and
insight generation—are small client components.

The trends chart is hand-written SVG with an accessible data table. Four series did not justify adding
a charting dependency, and the table ensures the information is available without relying on vision.

The interface supports the complete task without hiding state transitions:

- validation errors stay next to the form;
- generation can be cancelled;
- the summary appears progressively;
- patterns and discussion topics appear only after final validation;
- provider failures have actionable messages based on machine-readable codes.

## Testing strategy

I tested the boundaries where silent failures would be most expensive rather than optimising for a
coverage percentage.

| Area               | What the tests prove                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| Shared contracts   | Dates, scale boundaries, strict input, defaults, and response limits            |
| AI parser          | Malformed/fenced JSON, aliases, normalisation, truncation, and rejection        |
| Safety guardrail   | Diagnostic and prescriptive language cannot be persisted                        |
| Provider and retry | SSE chunk boundaries, UTF-8, cancellation, timeout, and retry policy            |
| API end to end     | Real HTTP and PostgreSQL behavior, daily upsert, errors, streaming, provenance  |
| Web                | Form payloads, SSE assembly, progressive/final rendering, and accessible trends |

```bash
pnpm test
pnpm test:e2e
```

The mock provider keeps unit and UI tests deterministic and offline. End-to-end tests use real
PostgreSQL because uniqueness, transactions, and migrations are database behavior—not details a mock
can prove.

## Privacy and security

- Data sent to AI is minimised; free-text notes are opt-in.
- Secrets are read from validated environment variables, never included in URLs or logs.
- Input is validated at the API boundary and again through database constraints.
- Unknown fields are rejected instead of silently ignored.
- Internal errors do not expose stack traces, SQL, connection strings, or provider payloads.
- Containers run as non-root, and `.env` is excluded from the image build context.
- Prompt rules and a post-generation guardrail both enforce the non-diagnostic boundary.

Authentication was intentionally left out because the exercise does not require it. Repository methods
already receive `userId`, and demo-user resolution is isolated in one service, providing a clear seam
for real authentication and tenant scoping.

## Deliberate trade-offs

| Decision                   | Benefit                                     | Cost / next threshold                                                  |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Layered architecture       | Familiar and easy to trace                  | Introduce more domain boundaries only when complexity appears          |
| Synchronous SSE generation | Simple and responsive for short generations | Move to a queue when jobs must survive disconnects or take much longer |
| Regex safety guardrail     | Fast, deterministic, explainable            | Add a labelled evaluation set and stronger classifier for production   |
| PostgreSQL arrays          | Small schema for bounded lists              | Normalise if symptoms become independent searchable entities           |
| Mock provider by default   | Reviewable offline and deterministic        | Gemini must be enabled explicitly for real generation                  |
| No authentication          | Keeps the case focused                      | First requirement before handling real user data                       |

## What I would do next

In product order:

1. Add authentication and enforce per-user access at every boundary.
2. Add an evaluation dataset for prompt and guardrail regressions.
3. Introduce background jobs if generation duration outgrows a request lifecycle.
4. Add insight history and comparisons using the provenance already stored.
5. Add operational metrics for latency, retries, guardrail rejections, and provider failures.
6. Run type checking, unit tests, e2e tests, and image builds in CI.

## Review path

If you have limited time, review these files in order:

1. [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts) — shared contracts.
2. [`apps/api/src/check-ins/check-ins.service.ts`](apps/api/src/check-ins/check-ins.service.ts) — daily record rules.
3. [`apps/api/src/insights/insights.service.ts`](apps/api/src/insights/insights.service.ts) — main orchestration.
4. [`apps/api/src/ai/gemini.provider.ts`](apps/api/src/ai/gemini.provider.ts) — provider boundary.
5. [`apps/api/src/ai/insight-output.parser.ts`](apps/api/src/ai/insight-output.parser.ts) — untrusted output handling.
6. [`apps/api/src/ai/insight-guardrail.ts`](apps/api/src/ai/insight-guardrail.ts) — safety boundary.
7. [`apps/api/test/app.e2e.test.ts`](apps/api/test/app.e2e.test.ts) — system behavior through public APIs.
8. [`apps/web/components/InsightPanel.tsx`](apps/web/components/InsightPanel.tsx) — user-facing generation states.
