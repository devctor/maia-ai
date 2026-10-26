import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrendChart } from "@/components/TrendChart";
import { makeCheckIn } from "@/test/fixtures";

const CHECK_INS = [
  makeCheckIn({ date: "2025-03-01", wellbeing: 3, sleepQuality: 2, energy: 4, stress: 5 }),
  makeCheckIn({ date: "2025-03-02", wellbeing: 4, sleepQuality: 3, energy: 3, stress: 4 }),
  makeCheckIn({ date: "2025-03-03", wellbeing: 5, sleepQuality: 4, energy: 2, stress: 2 }),
];

describe("TrendChart", () => {
  it("draws one series per metric and exposes the same data as a table", () => {
    const { container } = render(<TrendChart checkIns={CHECK_INS} />);

    const series = container.querySelectorAll("polyline[data-series]");
    expect(series).toHaveLength(4);
    expect(Array.from(series).map((node) => node.getAttribute("data-series"))).toEqual([
      "wellbeing",
      "sleepQuality",
      "energy",
      "stress",
    ]);

    const legend = screen.getByRole("list");
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4);
    expect(within(legend).getByText("Bienestar")).toBeInTheDocument();
    expect(within(legend).getByText("Estrés")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(CHECK_INS.length + 1);
    expect(within(rows[1] as HTMLElement).getByRole("rowheader")).toHaveTextContent("2025-03-01");
  });

  it("summarises the trend for assistive technology", () => {
    render(<TrendChart checkIns={CHECK_INS} />);

    const image = screen.getByRole("img");
    expect(image.getAttribute("aria-label")).toContain("Bienestar: de 3 a 5");
    expect(image.getAttribute("aria-label")).toContain("Estrés: de 5 a 2");
  });

  it("explains the empty state instead of drawing an empty chart", () => {
    render(<TrendChart checkIns={[]} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Con dos o más registros/)).toBeInTheDocument();
  });
});
