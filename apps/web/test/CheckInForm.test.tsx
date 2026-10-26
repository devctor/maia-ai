import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckInForm } from "@/components/CheckInForm";
import { errorEnvelope, jsonResponse, makeCheckIn } from "@/test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function metricGroup(name: RegExp): HTMLElement {
  return screen.getByRole("group", { name });
}

/** The 1..5 slider that belongs to one metric. */
function metricSlider(name: RegExp): HTMLInputElement {
  return within(metricGroup(name)).getByRole("slider") as HTMLInputElement;
}

/** Picks a position by moving the slider, the way a drag over the track does. */
function slideTo(name: RegExp, value: number): void {
  fireEvent.change(metricSlider(name), { target: { value: String(value) } });
}

/** Picks a position by clicking its label under the track. */
async function clickPosition(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  value: number,
): Promise<void> {
  await user.click(
    within(metricGroup(name)).getByRole("button", { name: new RegExp(`valor ${value}$`) }),
  );
}

describe("CheckInForm", () => {
  it("sends the expected payload when every metric is answered with the slider", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCheckIn(), 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();

    render(<CheckInForm onCreated={onCreated} />);

    // The thumb rests in the middle before the first answer, so the drag path is exercised
    // with the other positions: moving to the resting one changes no value at all.
    slideTo(/Bienestar general/, 4);
    slideTo(/Calidad del sueño/, 2);
    slideTo(/Energía/, 5);
    slideTo(/Nivel de estrés/, 1);
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
      sleepQuality: 2,
      energy: 5,
      stress: 1,
      symptoms: ["headache"],
      notes: "Dormí poco",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Registro guardado");
  });

  it("sends the expected payload when every metric is answered with the position labels", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCheckIn(), 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckInForm onCreated={vi.fn()} />);

    await clickPosition(user, /Bienestar general/, 4);
    await clickPosition(user, /Calidad del sueño/, 3);
    await clickPosition(user, /Energía/, 2);
    await clickPosition(user, /Nivel de estrés/, 5);

    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      wellbeing: 4,
      sleepQuality: 3,
      energy: 2,
      stress: 5,
    });
  });

  it("starts every metric unselected and shows the chosen position", async () => {
    const user = userEvent.setup();
    render(<CheckInForm onCreated={vi.fn()} />);

    const group = metricGroup(/Bienestar general/);
    const slider = within(group).getByRole("slider") as HTMLInputElement;

    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "5");
    expect(slider).toHaveAttribute("step", "1");
    expect(within(group).getByText("Sin seleccionar")).toBeInTheDocument();

    slider.focus();
    expect(slider).toHaveFocus();

    slideTo(/Bienestar general/, 4);

    expect(within(group).getByText("4 de 5")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /valor 4$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByRole("button", { name: /valor 2$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Clicking the track where the thumb rests is an answer as well: the neutral thumb
    // becomes the middle of the scale.
    await user.click(metricSlider(/Energía/));
    expect(within(metricGroup(/Energía/)).getByText("3 de 5")).toBeInTheDocument();
  });

  it("blocks the submit while a metric is missing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckInForm onCreated={vi.fn()} />);

    slideTo(/Bienestar general/, 4);
    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Completa los cuatro indicadores para guardar el registro."),
    ).toBeInTheDocument();
    expect(
      within(metricGroup(/Calidad del sueño/)).getByText("Selecciona una opción"),
    ).toBeInTheDocument();
    expect(within(metricGroup(/Nivel de estrés/)).getByText("Selecciona una opción")).toBeInTheDocument();

    // The slider of the metric that is missing is flagged for assistive technology.
    const sleepSlider = metricSlider(/Calidad del sueño/);
    expect(sleepSlider).toHaveAttribute("aria-invalid", "true");
    expect(sleepSlider).toHaveAttribute("aria-describedby", "checkin-sleepQuality-error");
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

    slideTo(/Bienestar general/, 4);
    await clickPosition(user, /Calidad del sueño/, 3);
    slideTo(/Energía/, 2);
    await clickPosition(user, /Nivel de estrés/, 5);
    await user.click(screen.getByRole("button", { name: "Guardar registro" }));

    expect(await screen.findByText("El valor máximo es 5")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Los datos enviados no son válidos");
  });
});
