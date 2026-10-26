import { Dashboard } from "@/components/Dashboard";
import { apiBaseUrl, getLatestInsight, listCheckIns } from "@/lib/api";

/**
 * The page reads live data on every request. The API is a separate service that may not be up
 * while the web app is being built, so the page must never be prerendered at build time.
 */
export const dynamic = "force-dynamic";

const API_DOWN_NOTICE =
  "No se pudo contactar con la API. Se muestra una vista vacía; los registros aparecerán en cuanto la API esté disponible.";

/**
 * The failed notice names the endpoint that could not be reached.
 *
 * An empty dashboard is the same screen whether the API is down or the page is asking the wrong
 * address, and those two need opposite fixes. Naming the URL turns a blank page into a diagnosis
 * without exposing anything a user could not already guess from the address bar.
 */
function apiDownNotice(): string {
  return `${API_DOWN_NOTICE} Dirección intentada: ${apiBaseUrl()}`;
}

export default async function HomePage() {
  const [checkInsResult, insightResult] = await Promise.allSettled([
    listCheckIns(),
    getLatestInsight(),
  ]);

  const checkIns = checkInsResult.status === "fulfilled" ? checkInsResult.value : [];
  const insight = insightResult.status === "fulfilled" ? insightResult.value : null;
  const failed = [checkInsResult, insightResult].some((result) => result.status === "rejected");

  return (
    <Dashboard
      initialCheckIns={checkIns}
      initialInsight={insight}
      notice={failed ? apiDownNotice() : null}
    />
  );
}
