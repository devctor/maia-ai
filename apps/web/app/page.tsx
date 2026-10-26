import { Dashboard } from "@/components/Dashboard";
import { getLatestInsight, listCheckIns } from "@/lib/api";

/**
 * The page reads live data on every request. The API is a separate service that may not be up
 * while the web app is being built, so the page must never be prerendered at build time.
 */
export const dynamic = "force-dynamic";

const API_DOWN_NOTICE =
  "No se pudo contactar con la API. Se muestra una vista vacía; los registros aparecerán en cuanto la API esté disponible.";

export default async function HomePage() {
  const [checkInsResult, insightResult] = await Promise.allSettled([
    listCheckIns(),
    getLatestInsight(),
  ]);

  const checkIns = checkInsResult.status === "fulfilled" ? checkInsResult.value : [];
  const insight = insightResult.status === "fulfilled" ? insightResult.value : null;
  const failed = [checkInsResult, insightResult].some((result) => result.status === "rejected");

  return (
    <Dashboard initialCheckIns={checkIns} initialInsight={insight} notice={failed ? API_DOWN_NOTICE : null} />
  );
}
