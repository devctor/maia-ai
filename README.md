# Maia Care — technical case

A small full-stack app where a user records how she feels each day and receives a **non-diagnostic
wellness insight** generated from her recent records.

Stack: pnpm monorepo · Next.js 15 · NestJS 10 · PostgreSQL 17 · Drizzle · Gemini (streaming) · Docker.

> **Not medical advice.** Maia Care offers a wellness reflection. It does not diagnose, does not infer
> causes and does not replace a health professional.

---

## 1. Run it

Requirements: Node 22+, pnpm 10+, Docker.

### With Docker (one command)

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. The API listens on <http://localhost:3001>. Migrations run
automatically when the API container starts.

The page is rendered by the server first and hydrated by the browser afterwards, so it calls the API
from two different places. The browser uses `NEXT_PUBLIC_API_URL` (`localhost:3001`, the published
host port). The Next.js container uses `API_URL_INTERNAL` (`http://api:3001`, the compose service
name), because inside a container `localhost` is that container and the published host port is not
reachable from there. The web service also maps `localhost` to the host gateway, so an environment
that pins `localhost` keeps working.

Host ports are configurable, because 3000 and 3001 are commonly already taken:

```bash
WEB_PORT=4300 API_PORT=4301 POSTGRES_PORT=6434 docker compose up --build
```

`CORS_ORIGINS` follows `WEB_PORT` and container names derive from the compose project, so the stack
never collides with another checkout on the same machine.

### Locally (hot reload)

```bash
cp .env.example .env
pnpm install

pnpm db:up          # PostgreSQL 17 on localhost:5434
pnpm db:migrate     # applies the versioned migration
pnpm db:seed        # demo user + 8 check-ins

pnpm dev            # web :3000, API :3001
```

### AI provider

The default is `AI_PROVIDER=mock`: deterministic, offline, no API key, **no network**. It derives real
sentences from the actual records, so the whole app — UI, parser, guardrail, storage — is exercisable
without spending quota.

To use the real provider:

```bash
# .env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key        # free tier is enough
GEMINI_MODEL=gemini-3.1-flash-lite
```

If `AI_PROVIDER=gemini` and the key is missing, the API **refuses to start**. A misconfigured provider
is a deployment error; discovering it while a user waits is worse than discovering it at boot.

### Configuration

Every value is validated once at boot by `config/env.ts`; an invalid environment fails the process
instead of failing a request. `.env.example` is the reference file.

| Variable                                  | Default                   | What it controls                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | — (required)              | PostgreSQL connection. Must be a `postgres://` or `postgresql://` URL                                                                                                                                                                        |
| `API_PORT` / `WEB_PORT` / `POSTGRES_PORT` | `3001` / `3000` / `5434`  | Host ports used by `docker-compose.yml`. Overriding them is one command: `WEB_PORT=4300 API_PORT=4301 POSTGRES_PORT=6434 docker compose up`. Only the published host side moves; inside the compose network the API always listens on `3001` |
| `CORS_ORIGINS`                            | `http://localhost:3000`   | Comma-separated. The browser calls the API directly, so it must be explicit                                                                                                                                                                  |
| `DEMO_USER_EMAIL` / `DEMO_USER_NAME`      | `ana@example.com` / `Ana` | The seeded demo user. There is no auth in this case, by design                                                                                                                                                                               |
| `DIAGNOSTICS_ENABLED`                     | `false`                   | Mounts the throwing diagnostic routes described in _Errors_. The e2e suite is the only caller that turns it on                                                                                                                               |
| `AI_PROVIDER`                             | `mock`                    | `gemini` or `mock`                                                                                                                                                                                                                           |
| `GEMINI_API_KEY`                          | —                         | Required when `AI_PROVIDER=gemini`, and never logged                                                                                                                                                                                         |
| `GEMINI_MODEL`                            | `gemini-3.1-flash-lite`   | Model id sent to the provider                                                                                                                                                                                                                |
| `AI_TIMEOUT_MS`                           | `20000`                   | Per-attempt budget, enforced with `AbortController`                                                                                                                                                                                          |
| `AI_MAX_ATTEMPTS`                         | `3`                       | Bounded retries for transient failures only                                                                                                                                                                                                  |
| `AI_RETRY_BASE_DELAY_MS`                  | `400`                     | Base for the exponential backoff with jitter                                                                                                                                                                                                 |
| `NEXT_PUBLIC_API_URL`                     | `http://localhost:3001`   | Inlined into the browser bundle at build time. The address _the browser_ uses                                                                                                                                                                |
| `API_URL_INTERNAL`                        | —                         | Compose sets it to `http://api:3001`. The address _the Next.js server_ uses when it renders the page; never shipped to the browser                                                                                                           |

`DIAGNOSTICS_ENABLED=false` is the deployed value and the safe one: the routes answer `404`. Setting
it to `true` exposes four endpoints that fail on purpose, which is what the error-envelope tests need
and nothing else should.

`DIAGNOSTICS_ENABLED=false` is the deployed value and the safe one: the routes answer `404`. Setting
it to `true` exposes four endpoints that fail on purpose, which is what the error-envelope tests need
and nothing else should.

### Tests

```bash
pnpm test       # 23 API unit + 24 web unit        (no database, no network)
pnpm test:e2e   # 27 API end-to-end                (needs `pnpm db:up`, real PostgreSQL)
```

All green: **89 tests**.

| Suite          | What it proves                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Contracts (15) | The rules both apps and the database depend on: bounds, calendar validity, strictness                                |
| API unit (23)  | Parser tolerance, guardrail, retry/backoff, SSE parsing, prompt data minimisation                                    |
| API e2e (27)   | Real HTTP + real SQL: upsert, unique index, SSE framing, error envelope, provenance                                  |
| Web unit (24)  | Form payload, SSE client assembly, insight states per error code, chart accessibility, server vs browser API address |

### API surface

```
GET  /health                     → { status, database, checkedAt }
GET  /check-ins?limit=30         → { items: CheckIn[] }        (most recent first)
POST /check-ins                  → 201 CheckIn                 (upsert per day)
POST /insights                   → 201 Insight                 (JSON)
POST /insights/stream            → text/event-stream           (token* → insight | error)
GET  /insights/latest            → 200 Insight | 404
```

```bash
curl localhost:3001/health
curl -X POST localhost:3001/check-ins -H 'content-type: application/json' \
  -d '{"date":"2026-01-05","wellbeing":4,"sleepQuality":2,"energy":3,"stress":5,"symptoms":["headache"]}'
curl -X POST localhost:3001/insights/stream -H 'content-type: application/json' -d '{"includeNotes":false}'
```

---

## 2. Architecture and technical decisions

```
apps/
├── api/                       NestJS — traditional layered architecture
│   ├── drizzle/               versioned SQL migration
│   └── src/
│       ├── check-ins/         controller → service → repository
│       ├── insights/          controller → service → repository
│       ├── ai/                provider interface, Gemini, mock, parser, guardrail, retry
│       ├── users/             controller-less: resolves the single demo user
│       ├── common/            error filter, domain errors, validation pipe, request id
│       ├── config/            environment schema, validated at boot
│       └── db/                Drizzle schema, pool, migrations
├── web/                       Next.js App Router — Server Components + client islands
└── packages/
    └── contracts/             Zod schemas and inferred types shared by both apps
```

### Layered backend, and why not more than that

`controller → service → repository`. The controller validates and maps HTTP; the service owns the
rules; the repository owns SQL. That is the whole design.

Layered architecture is the right size here: the domain is one entity plus one generated artifact.
Hexagonal or DDD would add ports, adapters and aggregates around a single aggregate with two
operations, and every abstraction would need a justification that does not exist yet. What _does_ pay
off — and is present — is the boundary that actually changes for reasons outside our control: the AI
provider. Everything else stays a straight line.

### One contract package

`packages/contracts` is the single source of truth for request, response and error shapes. The API
parses incoming data with those schemas; the web app types its payloads with the inferred types. A
contract change therefore breaks the build on both sides instead of failing at runtime in the browser.
It also removes the classic duplication: `class-validator` DTO classes describing the same rules the
frontend already knows.

### Database choices

**PostgreSQL** because the data is relational (a user has check-ins, an insight cites check-ins), the
schema benefits from real constraints, and `text[]` covers symptoms without a join table. **Drizzle**
over Prisma or TypeORM: the SQL stays visible, the migration is a reviewable `.sql` file, and there is
no generated client to keep in sync.

Data model:

```
users (id, email, display_name, created_at)
check_ins (id, user_id → users, date, wellbeing, sleep_quality, energy, stress,
           symptoms text[], notes, created_at, updated_at)
           UNIQUE (user_id, date)
insights (id, user_id → users, summary, patterns text[], topics_to_discuss text[],
          disclaimer, provider, model, created_at)
insight_check_ins (insight_id → insights, check_in_id → check_ins)   -- provenance
```

Three decisions worth defending:

1. **`date` is a `date`, not a timestamp.** A check-in belongs to a calendar day. Storing an instant
   makes the same day land on different values per timezone.
2. **`UNIQUE (user_id, date)` is the guarantee, not the service.** Creating a check-in is an atomic
   `INSERT ... ON CONFLICT DO UPDATE`, so the same day is edited rather than duplicated, and two
   concurrent requests for the same day are safe. The constraint lives in the database because
   application code can be bypassed by a script or a migration; the index cannot.
3. **`insight_check_ins` records exactly which check-ins produced an insight.** Without that link the
   generated text is unexplainable — you cannot answer "why did it say that?" or re-evaluate an old
   insight against new rules. The insight row and its links are written in one transaction.

Also in the migration: `CHECK` constraints for the 1..5 scales and the notes length. The API validates
first and returns a helpful message; the database refuses anything that slipped past.

### Errors

One envelope, one translation:

```json
{ "statusCode": 422, "code": "INSUFFICIENT_DATA", "message": "…", "details": {}, "requestId": "…" }
```

The UI switches on `code`, never on message text. Every response carries `x-request-id`, echoed in logs:
when a user reports a failure, the id is all you need to find that request.

`describeError` in `common/error-response.ts` is the only thing that turns a thrown value into a body.
Two callers share it: the global `AllExceptionsFilter`, and the SSE endpoint, which cannot use a filter
once the first frame is written. They used to disagree — the same failure answered `NOT_FOUND` over
JSON and `INTERNAL_ERROR` inside a stream — and a single translation is what makes them agree.

**The disclosure rule is a status boundary, not a judgement call:**

| Thrown                  | Client sees                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AppError` (deliberate) | Its `code`, `message` and `details`. The message is written for a person; `details` holds field paths and retry signals            |
| `ZodError`              | `VALIDATION_ERROR` with the issue list                                                                                             |
| `HttpException` 4xx     | Its own message: a client mistake is something we can explain                                                                      |
| `HttpException` 5xx     | `INTERNAL_ERROR` and a generic message. The payload is a SQL fragment, a connection string or a provider body — it goes to the log |
| Anything else           | `INTERNAL_ERROR` and a generic message. The thrown value is never read                                                             |

5xx bodies never contain stack traces, SQL or provider payloads, and that is enforced by tests rather
than by review. A value that is not an `Error` is normalised to a string before it reaches the logger,
because `Logger.error(message, object)` hands the object to `util.inspect` and will happily walk a
request bag that holds an API key.

The request id is read from the header the middleware wrote, so the filter depends on no framework
type. `requestId` in an SSE `error` event is the same id as in a JSON failure: both point at one log line.

Those guarantees are only observable through a response, and no production route fails on demand. So
`DiagnosticsController` mounts four throwing routes that answer `404` unless `DIAGNOSTICS_ENABLED=true`.
The e2e suite is the only caller that switches it on; a deployment leaves it off, and the endpoint is
safe to expose either way.

### Frontend

Next.js App Router. The initial page is a Server Component, so the first paint already has the
check-ins; only the interactive parts (form, insight panel) are client components. Types come from the
same contract package. The trend chart is hand-drawn SVG with a visually hidden data table — four
series did not justify a chart dependency, and a chart that is only a picture excludes screen readers.

---

## 3. AI integration

### What is sent to the model

Only what the insight needs:

- the **last 10 check-ins**, most recent first (`INSIGHT_WINDOW_SIZE`)
- per check-in: `date` and the four 1..5 metrics
- symptom **codes plus their Spanish labels**
- free-text notes **only if the user opts in** (`includeNotes`, off by default), truncated to 500 chars

**Never sent:** email, user id, check-in ids, or anything else identifying. The model describes numbers;
identity cannot improve the output and is the easiest thing to leak. `buildInsightPrompt` is a pure
function, so what leaves the process is reviewable in one file and testable without a network.

Streaming uses `streamGenerateContent?alt=sse` with the key in a **header** (`x-goog-api-key`), never
in a URL, because URLs end up in logs and proxies. Constrained decoding
(`responseMimeType: application/json` + `responseJsonSchema`) removes whole classes of malformed
output before validation runs.

### How the response is validated

A model returns text. It crosses three gates before anything is stored:

1. **Parse and repair** (`insight-output.parser.ts`). Strips markdown fences, extracts the outermost
   balanced JSON object from surrounding prose, accepts `topics_to_discuss` / `topicsToDiscuss` /
   `topics`, coerces a string into a one-element array, trims, drops empties, deduplicates, caps lengths.
   The policy is explicit: repair what is unambiguous, reject what is not. No usable `summary` → reject.
2. **Guardrail** (`insight-guardrail.ts`). Deterministic, accent- and case-insensitive patterns for
   diagnostic or prescriptive language ("diagnóstico", "tienes un/una …", "padeces", "es probable que
   tengas", "medicación", "dosis", "tratamiento para"). A match rejects the answer and **nothing is
   persisted**. This is a documented heuristic safety net, not a classifier — it catches the dangerous
   shapes and is honest about being partial.
3. **Schema** (`insightContentSchema` from the contract package) — the same schema the API and web app
   use, so a stored insight is by definition renderable.

The stored `disclaimer` is **ours**, not the model's: a model cannot be trusted to state its own
limitations, and that text must not drift with prompt changes.

### Retries

`retry.ts` retries only transient failures (429, 5xx, network, timeout) with exponential backoff and
**full jitter** — without jitter, every client that failed at the same moment retries at the same
moment, which is how a rate limit becomes a self-inflicted stampede. Other 4xx are not retried: a
malformed request or a bad key will fail identically, and retrying only burns quota. An aborted request
is never retried. Attempts are counted exactly, and the timeout uses `AbortController`.

### Streaming

`POST /insights/stream` emits two different things, and they are not interchangeable:

- `event: token` — raw model deltas, for progressive display. **Untrusted**, possibly malformed, never
  presented as the answer.
- `event: insight` — the validated, guarded, persisted insight. The only terminal success event.
- `event: error` — the same error envelope the JSON endpoint would return.

If the client disconnects, the provider call is aborted: no quota is spent on an answer nobody will
read. Nothing is persisted unless validation succeeded, so a failed stream leaves no trace.

### Provider swap

`AiProvider` is the seam:

```ts
interface AiProvider {
  readonly name: "gemini" | "mock";
  generateInsight(input, options?): Promise<{ text; model; provider }>;
}
```

Business logic injects `AI_PROVIDER`, never a vendor module. Adding a provider is one implementation and
one line of configuration; testing the pipeline needs no network.

---

## 4. Privacy and security

- **Data minimisation.** Notes are opt-in, truncated, and never sent by default. No identifiers reach
  the model. The prompt builder is the single gate for outbound data.
- **Secrets.** The key lives in `.env` (gitignored), is read once at boot through a validated schema,
  and travels in a header. It is never logged, and a missing key fails at boot rather than at request
  time.
- **No secrets in the image.** Docker passes configuration as environment variables at runtime;
  `.dockerignore` keeps `.env` and `node_modules` out of the build context. Containers run as non-root.
- **Input validation at the boundary.** Zod schemas, `.strict()` so unknown fields are rejected instead
  of silently ignored, plus database `CHECK` constraints as a second line.
- **Errors do not leak internals.** The envelope exposes a stable code and a Spanish message; details
  are limited to field paths. Stack traces, SQL and provider payloads stay in server logs, and the 5xx
  boundary that enforces this is covered by tests rather than by review.
- **Traceability without exposure.** `requestId` correlates logs with a user report without containing
  any personal data.
- **Guardrail.** The non-diagnostic control is enforced twice: in the prompt and deterministically after
  generation.
- **No auth, by design.** The case explicitly does not require it, and the app has one demo user. This
  is the first thing to add before any real deployment — see below.

Hardening for a real deployment: authentication with per-user row scoping (the repositories already
take `userId`), rate limiting per user, TLS, encryption at rest, audit trail for AI access, PII
retention policy, and a data-processing agreement with the AI provider.

---

## 5. What I would improve with more time

Ordered by value, not by effort:

1. **Authentication and real user scoping.** Every repository method already takes `userId`; today the
   demo user is resolved in one place (`UsersService.getDemoUser`), which is exactly the seam to
   replace.
2. **Async generation with a job queue.** Generation currently holds the request. Over ~2 s that is
   fine; for longer prompts or heavier models, `insight request → 202 + job id → poll/subscribe` with
   BullMQ would remove the timeout ceiling and let retries survive a client disconnect.
3. **Model-level evaluation.** The guardrail is regex. Worth adding a labelled set of rejected/benign
   answers, measured per prompt change, so prompt edits are regression-tested like code.
4. **Richer insight history.** Insights are stored with provenance but the UI shows only the latest.
   A timeline with "what changed between two insights" is cheap now that provenance exists.
5. **Observability.** Structured logs are in place; metrics for generation latency, retry rate,
   guardrail rejections and provider error codes would make the AI path operable.
6. **Repository integration tests.** SQL is exercised end-to-end but has no focused tests per query;
   the upsert and the provenance transaction deserve their own.
7. **CI** running typecheck, tests, e2e against a service container, and image builds on every push.

---

## 6. Trade-offs worth naming

- **One check-in per day (upsert) instead of multiple.** Makes the day the unit of record and the chart
  unambiguous. A user who wants to log morning and evening needs a different model — a `time` column
  and a different uniqueness rule.
- **Synchronous streaming endpoint over a queue.** Simpler and enough for a 1–2 s generation; the cost
  is that a disconnect cancels the work.
- **Regex guardrail over a classifier.** Explainable, fast, free, and provably partial. A classifier
  would catch more and be harder to reason about and to test.
- **Drizzle over Prisma.** Less tooling, more control: migrations are SQL you can read in review.
- **No auth.** Explicitly out of scope, and confined to a single seam so it is not a rewrite.

---

## 7. Where the time went

Written with an ODD feature document (`odd/tasks/maia-care-checkins.md`) that records the specs and the
task split. Two things are worth reporting honestly:

- The AI layer was implemented twice: an early attempt stalled and produced tests without an
  implementation, so it was rewritten against those tests. The tests were kept because they expressed
  the intended contract well; the implementation had to earn them.
- Three bugs were found by running things, not by reading them: Nest cannot inject dependencies when
  the test runner compiles with a bundler (no `design:paramtypes` metadata), the migration folder path
  was wrong inside the production image, and the web container's `next` binary was addressed by a path
  that pnpm's symlink layout does not provide. All three are now covered by a check that would fail
  again.
