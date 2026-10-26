import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AI_PROVIDER, type AiProvider } from "../src/ai/ai-provider.interface";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/all-exceptions.filter";
import { AiUnavailableError } from "../src/common/errors";
import { requestIdMiddleware } from "../src/common/request-id.middleware";

import type { Database, DatabaseConnection } from "../src/db/database";
import { runMigrations } from "../src/db/database";
import { DATABASE, DATABASE_CONNECTION } from "../src/db/database.module";
import { checkIns, insightCheckIns, insights, users } from "../src/db/schema";

/**
 * End-to-end tests against a real PostgreSQL.
 *
 * Why real HTTP + real SQL: the unit tests already cover the AI pipeline with a fake. The failures
 * that survive unit testing are the ones at the seams — the migration, the upsert conflict target,
 * the SSE framing, the error envelope actually reaching the client. Stubbing those would test the
 * stubs.
 *
 * The double used here replaces only the AI provider, because reaching a paid third party from a
 * test suite is neither deterministic nor acceptable.
 */
class ScriptedAiProvider implements AiProvider {
  readonly name = "mock" as const;
  calls: Array<{ includeNotes: boolean }> = [];
  private response: { text?: string; error?: Error; deltas?: string[] } = {};

  nextText(text: string): void {
    this.response = { text };
  }

  nextStreamed(text: string, deltas: string[]): void {
    this.response = { text, deltas };
  }

  nextError(error: Error): void {
    this.response = { error };
  }

  async generateInsight(
    input: { includeNotes: boolean },
    options?: { onDelta?: (delta: string) => void },
  ): Promise<{ text: string; model: string; provider: "mock" }> {
    this.calls.push({ includeNotes: input.includeNotes });
    if (this.response.error) {
      throw this.response.error;
    }
    for (const delta of this.response.deltas ?? []) {
      options?.onDelta?.(delta);
    }
    return { text: this.response.text ?? "", model: "scripted", provider: "mock" };
  }
}

const validInsight = JSON.stringify({
  summary: "Los registros muestran altibajos en el sueño y la energía.",
  patterns: ["El sueño bajó a mitad de la semana."],
  topics_to_discuss: ["Hablar de la rutina de descanso."],
});

const provider = new ScriptedAiProvider();
let app: INestApplication;
let db: Database;
let connection: DatabaseConnection;

beforeAll(async () => {
  // The override must be applied before the module graph is instantiated: `compile()` above it
  // would resolve the real provider and the fake would never be injected.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_PROVIDER)
    .useValue(provider)
    .compile();

  app = moduleRef.createNestApplication();
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  db = app.get<Database>(DATABASE);
  connection = app.get<DatabaseConnection>(DATABASE_CONNECTION);
  await runMigrations(db);
});

afterAll(async () => {
  await app.close();
  await connection.close();
});

beforeEach(async () => {
  provider.calls = [];
  // Each test starts from a known state. Deleting the users cascades to check-ins, insights and
  // their provenance links, so a leftover order dependency cannot hide a bug.
  await db.delete(insightCheckIns);
  await db.delete(insights);
  await db.delete(checkIns);
  await db.delete(users);
});

async function createCheckIns(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const response = await request(app.getHttpServer())
      .post("/check-ins")
      .send({
        date: `2026-02-${String(10 + index).padStart(2, "0")}`,
        wellbeing: 3,
        sleepQuality: 2,
        energy: 4,
        stress: 3,
        symptoms: ["headache"],
      });
    expect(response.status).toBe(201);
  }
}

describe("health", () => {
  it("reports the database round-trip", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: "ok" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});

describe("POST /check-ins", () => {
  it("creates a check-in and echoes the stored values", async () => {
    const response = await request(app.getHttpServer()).post("/check-ins").send({
      date: "2026-01-05",
      wellbeing: 4,
      sleepQuality: 2,
      energy: 3,
      stress: 5,
      symptoms: ["headache", "fatigue"],
      notes: "  semana intensa  ",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      date: "2026-01-05",
      wellbeing: 4,
      sleepQuality: 2,
      energy: 3,
      stress: 5,
      symptoms: ["headache", "fatigue"],
      notes: "semana intensa",
    });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("updates the same day instead of creating a duplicate", async () => {
    const first = await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-06", wellbeing: 2, sleepQuality: 2, energy: 2, stress: 2 });
    const second = await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-06", wellbeing: 5, sleepQuality: 5, energy: 5, stress: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.wellbeing).toBe(5);

    const rows = await db.select().from(checkIns);
    expect(rows).toHaveLength(1);
  });

  it("keeps the unique index as the real guarantee, not just the service", async () => {
    await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-07", wellbeing: 3, sleepQuality: 3, energy: 3, stress: 3 });
    await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-07", wellbeing: 4, sleepQuality: 4, energy: 4, stress: 4 });

    const rows = await db.select().from(checkIns);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.wellbeing).toBe(4);
  });

  it("rejects a value outside the scale with a validation envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-08", wellbeing: 9, sleepQuality: 3, energy: 3, stress: 3 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.requestId).toBeTruthy();
    expect(response.body.details.issues[0].path).toBe("wellbeing");
  });

  it("rejects an impossible calendar day", async () => {
    const response = await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-02-30", wellbeing: 3, sleepQuality: 3, energy: 3, stress: 3 });

    expect(response.status).toBe(400);
    expect(response.body.details.issues[0].path).toBe("date");
  });

  it("rejects unknown fields instead of silently ignoring them", async () => {
    const response = await request(app.getHttpServer())
      .post("/check-ins")
      .send({ date: "2026-01-09", wellbeing: 3, sleepQuality: 3, energy: 3, stress: 3, age: 30 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /check-ins", () => {
  it("returns the most recent first and honours the limit", async () => {
    await createCheckIns(3);

    const response = await request(app.getHttpServer()).get("/check-ins?limit=2");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].date).toBe("2026-02-12");
    expect(response.body.items[1].date).toBe("2026-02-11");
  });

  it("rejects a limit above the documented maximum", async () => {
    const response = await request(app.getHttpServer()).get("/check-ins?limit=999");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /insights", () => {
  it("refuses to generate from a single check-in", async () => {
    await createCheckIns(1);

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INSUFFICIENT_DATA");
    expect(provider.calls).toHaveLength(0);
    expect(await db.select().from(insights)).toHaveLength(0);
  });

  it("persists the insight with exactly the check-ins that produced it", async () => {
    await createCheckIns(3);
    provider.nextText(validInsight);

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      summary: "Los registros muestran altibajos en el sueño y la energía.",
      patterns: ["El sueño bajó a mitad de la semana."],
      topicsToDiscuss: ["Hablar de la rutina de descanso."],
      provider: "mock",
      model: "scripted",
    });
    // The disclaimer is the backend's, never the model's.
    expect(response.body.disclaimer).toContain("no constituye un diagnóstico");

    const stored = await db.select().from(insights);
    expect(stored).toHaveLength(1);
    const links = await db.select().from(insightCheckIns);
    expect(links).toHaveLength(3);
    expect(new Set(links.map((link) => link.checkInId))).toEqual(
      new Set(response.body.sourceCheckInIds),
    );
  });

  it("repairs a fenced answer instead of failing", async () => {
    await createCheckIns(2);
    provider.nextText("```json\n" + validInsight + "\n```");

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(201);
  });

  it("rejects a diagnostic answer and stores nothing", async () => {
    await createCheckIns(3);
    provider.nextText(
      JSON.stringify({
        summary: "Es probable que tengas una migraña crónica.",
        patterns: [],
        topics_to_discuss: ["Tomar una pastilla diaria."],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("AI_GUARDRAIL_REJECTED");
    expect(await db.select().from(insights)).toHaveLength(0);
    expect(await db.select().from(insightCheckIns)).toHaveLength(0);
  });

  it("rejects an unparseable answer as a bad gateway", async () => {
    await createCheckIns(2);
    provider.nextText("Lo siento, no puedo responder a eso.");

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("AI_INVALID_RESPONSE");
  });

  it("surfaces provider unavailability with a retryable signal", async () => {
    await createCheckIns(2);
    provider.nextError(new AiUnavailableError("saturado", true));

    const response = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AI_UNAVAILABLE");
    expect(response.body.details.retryable).toBe(true);
  });

  it("passes the notes preference to the provider", async () => {
    await createCheckIns(2);
    provider.nextText(validInsight);

    await request(app.getHttpServer()).post("/insights").send({ includeNotes: true });

    expect(provider.calls).toEqual([{ includeNotes: true }]);
  });
});

describe("POST /insights/stream", () => {
  it("streams raw deltas and terminates with the validated insight", async () => {
    await createCheckIns(3);
    const deltas = ['{"summary":"', "Texto corto.", '","patterns":[],"topics_to_discuss":[]}'];
    provider.nextStreamed(deltas.join(""), deltas);

    const response = await request(app.getHttpServer())
      .post("/insights/stream")
      .send({ includeNotes: false })
      .buffer(true)
      .parse((res, done) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => done(null, body));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    const body = response.body as string;
    expect(body.match(/event: token/g)?.length).toBe(deltas.length);
    expect(body).toContain("event: insight");
    expect(body).toContain('"summary":"Texto corto."');
    // The terminal event is the validated payload, not the raw text.
    expect(body.trimEnd().endsWith("}")).toBe(true);
    expect(await db.select().from(insights)).toHaveLength(1);
  });

  it("emits nothing and fails with a status code when there is not enough data", async () => {
    await createCheckIns(1);

    const response = await request(app.getHttpServer())
      .post("/insights/stream")
      .send({ includeNotes: false });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INSUFFICIENT_DATA");
  });

  it("does not persist anything when the answer fails the guardrail", async () => {
    await createCheckIns(2);
    provider.nextText(
      JSON.stringify({
        summary: "Tienes una infección y necesitas medicación.",
        patterns: [],
        topics_to_discuss: [],
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/insights/stream")
      .send({ includeNotes: false })
      .buffer(true)
      .parse((res, done) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => done(null, body));
      });

    expect(response.status).toBe(422);
    expect(await db.select().from(insights)).toHaveLength(0);
  });
});

describe("GET /insights/latest", () => {
  it("returns 404 with the error envelope when nothing was generated yet", async () => {
    const response = await request(app.getHttpServer()).get("/insights/latest");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
    expect(response.body.requestId).toBeTruthy();
  });

  it("returns the most recent insight", async () => {
    await createCheckIns(2);
    provider.nextText(validInsight);
    const created = await request(app.getHttpServer())
      .post("/insights")
      .send({ includeNotes: false });

    const response = await request(app.getHttpServer()).get("/insights/latest");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
    expect(response.body.sourceCheckInIds).toHaveLength(2);
  });
});

describe("request correlation", () => {
  it("echoes an incoming request id so logs and client reports line up", async () => {
    const requestId = randomUUID();

    const response = await request(app.getHttpServer())
      .get("/health")
      .set("x-request-id", requestId);

    expect(response.headers["x-request-id"]).toBe(requestId);
  });
});
