"use client";

import { useState } from "react";
import type { CheckIn, Insight } from "@maia/contracts";
import { listCheckIns } from "@/lib/api";
import { CheckInForm } from "./CheckInForm";
import { CheckInList } from "./CheckInList";
import { InsightPanel } from "./InsightPanel";
import { TrendChart } from "./TrendChart";

interface DashboardProps {
  initialCheckIns: CheckIn[];
  initialInsight: Insight | null;
  notice: string | null;
}

/**
 * Holds the records in the browser so a new check-in can be saved and the list refreshed without
 * a full page reload. It is seeded with the data the server already fetched, so the first paint
 * is complete.
 */
export function Dashboard({ initialCheckIns, initialInsight, notice }: DashboardProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [listError, setListError] = useState<string | null>(null);

  async function handleCreated(): Promise<void> {
    try {
      setCheckIns(await listCheckIns());
      setListError(null);
    } catch {
      setListError("No se pudo actualizar la lista de registros.");
    }
  }

  return (
    <>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      <section className="panel">
        <h2>Registro del día</h2>
        <CheckInForm onCreated={handleCreated} />
      </section>

      <section className="panel">
        <h2>Evolución</h2>
        <TrendChart checkIns={checkIns} />
        {listError ? (
          <p className="form-error" role="alert">
            {listError}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Registros recientes</h2>
        <CheckInList checkIns={checkIns} />
      </section>

      <InsightPanel initialInsight={initialInsight} />
    </>
  );
}
