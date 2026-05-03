/**
 * Estado dos relatórios Analytics — um provider por vista (global ou por categoria).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

/**
 * @param {{ children: React.ReactNode, categoryUrl?: string | null }} props
 */
export function AnalyticsDashboardCacheProvider({ children, categoryUrl = null }) {
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

  const filterKey = categoryUrl != null ? String(categoryUrl).trim() : "";

  useEffect(() => {
    setCache({
      top: null,
      opp: null,
      score: null,
      scale: null,
      map: null
    });
    setError(null);
    setLoading(false);
  }, [filterKey]);

  const current = ANALYTICS_REPORT_TABS.find((t) => t.id === tab);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const q = filterKey !== "" ? `?categoryUrl=${encodeURIComponent(filterKey)}` : "";
      const json = await apiFetch(`${current.path}${q}`);
      setCache((c) => ({ ...c, [current.key]: json }));
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [current, filterKey]);

  /**
   * Carrega o separador activo ao abrir a vista ou ao mudar de separador (global e por categoria).
   * «Carregar dados» refresca apenas o separador actual.
   */
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const path = current.path;
    const cacheKey = current.key;
    const q = filterKey !== "" ? `?categoryUrl=${encodeURIComponent(filterKey)}` : "";
    void (async () => {
      try {
        const json = await apiFetch(`${path}${q}`);
        if (!cancelled) {
          setCache((c) => ({ ...c, [cacheKey]: json }));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterKey, tab, current?.key, current?.path]);

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
    throw new Error("useAnalyticsDashboardCache requer AnalyticsDashboardCacheProvider.");
  }
  return ctx;
}
