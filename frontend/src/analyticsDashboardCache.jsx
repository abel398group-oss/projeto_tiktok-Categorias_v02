/**
 * Estado dos relatório Analytics sob AppShell — persiste ao abrir workspace (/produto/...) ou /a-mao.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { apiFetch } from "./api.js";

export const ANALYTICS_REPORT_TABS = [
  { id: "top", label: "Top Products", path: "/analytics/top-products", key: "top" },
  { id: "opp", label: "Opportunities", path: "/analytics/opportunities", key: "opp" },
  { id: "score", label: "Product Score", path: "/analytics/product-score", key: "score" },
  { id: "scale", label: "🔥 Escalar", path: "/analytics/scalable-products", key: "scale" },
  { id: "map", label: "🧭 Mapa", path: "/analytics/category-map", key: "map" }
];

/** @type {React.Context<any>} */
const AnalyticsDashboardCacheContext = createContext(null);

export function AnalyticsDashboardCacheProvider({ children }) {
  const [tab, setTab] = useState("top");
  const [cache, setCache] = useState({
    top: null,
    opp: null,
    score: null,
    scale: null,
    map: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const current = ANALYTICS_REPORT_TABS.find((t) => t.id === tab);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch(current.path);
      setCache((c) => ({ ...c, [current.key]: json }));
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [current, setError]);

  const value = useMemo(
    () => ({
      tab,
      setTab,
      cache,
      setCache,
      loading,
      error,
      setError,
      load,
      tabs: ANALYTICS_REPORT_TABS
    }),
    [tab, cache, loading, error, load, setError]
  );

  return (
    <AnalyticsDashboardCacheContext.Provider value={value}>{children}</AnalyticsDashboardCacheContext.Provider>
  );
}

export function useAnalyticsDashboardCache() {
  const ctx = useContext(AnalyticsDashboardCacheContext);
  if (!ctx) {
    throw new Error("useAnalyticsDashboardCache requer AnalyticsDashboardCacheProvider (AppShell).");
  }
  return ctx;
}
