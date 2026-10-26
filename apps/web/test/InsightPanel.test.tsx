import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightPanel } from "@/components/InsightPanel";
import { errorEnvelope, makeInsight, sseResponse } from "@/test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An SSE response whose second frame only arrives when the test opens the gate. */
function gatedSseResponse(firstChunk: string, secondChunk: string) {
  const encoder = new TextEncoder();
  let calls = 0;
  let open: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const response = {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        async read(): Promise<{ done: boolean; value: Uint8Array | undefined }> {
          calls += 1;
          if (calls === 1) {
            return { done: false, value: encoder.encode(firstChunk) };
          }
          await gate;
          return { done: false, value: encoder.encode(secondChunk) };
        },
        releaseLock(): void {},
      }),
    },
    json: async () => ({}),
  } as unknown as Response;
  return { response, open: () => open?.() };
}

describe("InsightPanel", () => {
  it("renders the structured insight once the stream ends", async () => {
    const user = userEvent.setup();
    const insight = makeInsight();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: token\ndata: {"delta":"Texto en crudo"}\n\n',
          `event: insight\ndata: ${JSON.stringify(insight)}\n\n`,
        ]),
      ),
    );

    render(<InsightPanel />);
    await user.click(screen.getByRole("button", { name: "Generar insight" }));

    expect(await screen.findByText(insight.summary)).toBeInTheDocument();
    expect(screen.getByText("Patrones observados")).toBeInTheDocument();
    expect(screen.getByText("Más energía los días con mejor sueño")).toBeInTheDocument();
    expect(screen.getByText("Temas para comentar con un profesional")).toBeInTheDocument();
    expect(screen.getByText("Cómo mantener una rutina de sueño constante")).toBeInTheDocument();
    expect(screen.getByText(/Generado con mock/)).toBeInTheDocument();
    expect(screen.getByText(insight.disclaimer)).toBeInTheDocument();
  });

  it("replaces the raw stream with the structured view", async () => {
    const user = userEvent.setup();
    const insight = makeInsight();
    const { response, open } = gatedSseResponse(
      'event: token\ndata: {"delta":"Texto en crudo"}\n\n',
      `event: insight\ndata: ${JSON.stringify(insight)}\n\n`,
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    render(<InsightPanel />);
    await user.click(screen.getByRole("button", { name: "Generar insight" }));

    expect(await screen.findByText("Texto en crudo")).toBeInTheDocument();
    expect(screen.getByText("generando…")).toBeInTheDocument();

    open();

    await waitFor(() => expect(screen.queryByText("Texto en crudo")).toBeNull());
    expect(screen.getByText(insight.summary)).toBeInTheDocument();
  });

  it("shows the INSUFFICIENT_DATA copy for that error code", async () => {
    const user = userEvent.setup();
    const envelope = errorEnvelope(422, "INSUFFICIENT_DATA", "Hacen falta más registros");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([`event: error\ndata: ${JSON.stringify(envelope)}\n\n`]),
      ),
    );

    render(<InsightPanel />);
    await user.click(screen.getByRole("button", { name: "Generar insight" }));

    expect(
      await screen.findByText("Registra al menos 2 días de seguimiento antes de generar un insight."),
    ).toBeInTheDocument();
  });

  it("keeps the notes toggle off and explains why", () => {
    render(<InsightPanel />);

    const toggle = screen.getByLabelText(/Incluir mis notas/);
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(/Las notas pueden contener texto sensible y solo se envían al modelo/),
    ).toBeInTheDocument();
  });
});
