import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createCheckIn,
  getLatestInsight,
  listCheckIns,
  streamInsight,
} from "@/lib/api";
import {
  errorEnvelope,
  jsonResponse,
  makeCheckIn,
  makeInsight,
  sseResponse,
} from "@/test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listCheckIns", () => {
  it("returns the records of the API", async () => {
    const checkIn = makeCheckIn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [checkIn] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCheckIns()).resolves.toEqual([checkIn]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/check-ins?limit=30");
  });

  it("turns a non-ok JSON response into an ApiError that keeps the code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(errorEnvelope(422, "INSUFFICIENT_DATA", "Hacen falta más registros"), 422),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCheckIns()).rejects.toBeInstanceOf(ApiError);
    await expect(listCheckIns()).rejects.toMatchObject({
      statusCode: 422,
      code: "INSUFFICIENT_DATA",
      message: "Hacen falta más registros",
      requestId: "req-test-1",
    });
  });
});

describe("createCheckIn", () => {
  it("validates the response against the contract", async () => {
    const checkIn = makeCheckIn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(checkIn, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCheckIn({
        date: "2025-03-01",
        wellbeing: 3,
        sleepQuality: 4,
        energy: 2,
        stress: 5,
        symptoms: [],
        notes: null,
      }),
    ).resolves.toEqual(checkIn);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ date: "2025-03-01", wellbeing: 3 });
  });

  it("rejects a response that does not match the contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "not-a-uuid" }, 201)));

    await expect(
      createCheckIn({
        date: "2025-03-01",
        wellbeing: 3,
        sleepQuality: 4,
        energy: 2,
        stress: 5,
        symptoms: [],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getLatestInsight", () => {
  it("returns the stored insight", async () => {
    const insight = makeInsight();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(insight)));

    await expect(getLatestInsight()).resolves.toEqual(insight);
  });

  it("returns null when there is no insight yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(errorEnvelope(404, "NOT_FOUND", "No hay insight"), 404)),
    );

    await expect(getLatestInsight()).resolves.toBeNull();
  });
});

describe("streamInsight", () => {
  it("assembles the token frames and then the insight frame", async () => {
    const insight = makeInsight();
    const frames = [
      'event: token\ndata: {"delta":"Tu "}\n\n',
      'event: token\ndata: {"delta":"energía subió"}\n\n',
      `event: insight\ndata: ${JSON.stringify(insight)}\n\n`,
    ];
    // The chunks cut the frames in the middle, on purpose: a real stream does the same.
    const chunks = [
      frames[0]?.slice(0, 12) ?? "",
      `${frames[0]?.slice(12) ?? ""}${frames[1]?.slice(0, 20) ?? ""}`,
      `${frames[1]?.slice(20) ?? ""}${frames[2] ?? ""}`,
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));

    const deltas: string[] = [];
    const insights: unknown[] = [];
    const errors: ApiError[] = [];

    await streamInsight({
      includeNotes: false,
      onDelta: (delta) => deltas.push(delta),
      onInsight: (received) => insights.push(received),
      onError: (error) => errors.push(error),
    });

    expect(deltas).toEqual(["Tu ", "energía subió"]);
    expect(insights).toEqual([insight]);
    expect(errors).toEqual([]);
  });

  it("reports the error frame as an ApiError with the backend code", async () => {
    const envelope = errorEnvelope(422, "INSUFFICIENT_DATA", "Hacen falta más registros");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse([`event: error\ndata: ${JSON.stringify(envelope)}\n\n`])),
    );

    const errors: ApiError[] = [];
    await streamInsight({
      includeNotes: true,
      onDelta: () => undefined,
      onInsight: () => undefined,
      onError: (error) => errors.push(error),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("INSUFFICIENT_DATA");
    expect(errors[0]?.statusCode).toBe(422);
  });

  it("sends the includeNotes flag to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await streamInsight({
      includeNotes: true,
      onDelta: () => undefined,
      onInsight: () => undefined,
      onError: () => undefined,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ includeNotes: true });
  });

  it("throws the ApiError when the stream itself is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(errorEnvelope(503, "AI_UNAVAILABLE", "La IA no está disponible"), 503),
      ),
    );

    await expect(
      streamInsight({
        includeNotes: false,
        onDelta: () => undefined,
        onInsight: () => undefined,
        onError: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", statusCode: 503 });
  });
});
