import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInForm } from "@/components/CheckInForm";
import { errorEnvelope, jsonResponse, makeCheckIn } from "@/test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function metricGroup(name: RegExp): HTMLElement {
  return screen.getByRole("group", { name });
}

describe("CheckInForm", () => {
  it("sends the expected payload when every metric is answered", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCheckIn(), 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();

    render(<CheckInForm onCreated={onCreated} />);

    await user.click(within(metricGroup(/Bienestar general/)).getByLabelText("4"));
    await user.click(within(metricGroup(/Calidad del sueño/)).getByLabelText("3"));
    await user.click(within(metricGroup(/Energía/)).getByLabelText("2"));
    await user.click(within(metricGroup(/Nivel de estrés/)).getByLabelText("5"));
    await user.click(screen.getByLabelText("Dolor de cabeza"));
    await user.type(screen.getByLabelText(/Notas/), "Dormí poco");

    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/check-ins");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      wellbeing: 4,
      sleepQuality: 3,
      energy: 2,
      stress: 5,
      symptoms: ["headache"],
      notes: "Dormí poco",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Registro guardado");
  });

  it("blocks the submit while a metric is missing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckInForm onCreated={vi.fn()} />);

    await user.click(within(metricGroup(/Bienestar general/)).getByLabelText("4"));
    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Completa los cuatro indicadores para guardar el registro."),
    ).toBeInTheDocument();
    expect(
      within(metricGroup(/Calidad del sueño/)).getByText("Selecciona una opción"),
    ).toBeInTheDocument();
    expect(within(metricGroup(/Nivel de estrés/)).getByText("Selecciona una opción")).toBeInTheDocument();
  });

  it("shows the validation message returned by the server", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        errorEnvelope(400, "VALIDATION_ERROR", "Los datos enviados no son válidos", {
          issues: [{ path: "wellbeing", message: "El valor máximo es 5" }],
        }),
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckInForm onCreated={vi.fn()} />);

    await user.click(within(metricGroup(/Bienestar general/)).getByLabelText("4"));
    await user.click(within(metricGroup(/Calidad del sueño/)).getByLabelText("3"));
    await user.click(within(metricGroup(/Energía/)).getByLabelText("2"));
    await user.click(within(metricGroup(/Nivel de estrés/)).getByLabelText("5"));
    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    expect(await screen.findByText("El valor máximo es 5")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Los datos enviados no son válidos");
  });
});
