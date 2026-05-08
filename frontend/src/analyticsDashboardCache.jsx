/**
 * Estado dos relatórios Analytics — um provider por vista (global ou por categoria).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";

/** Limite alto só no separador Top Products — API aplica ordenação única e devolve até N linhas (ver `clampTopProductsLimit`). */
export const TOP_PRODUCTS_UI_FETCH_LIMIT = 5000;

/** Idem para Opportunities (`clampOpportunitiesLimit`). */
export const OPPORTUNITIES_UI_FETCH_LIMIT = 5000;

/** @typedef {"classic" | "low_sales" | "no_sales" | "below_median"} OpportunityMode */

/**
 * @param {string} path
 * @param {string} filterKey
 * @param {OpportunityMode} opportunityMode
 */
function buildAnalyticsQuery(path, filterKey, opportunityMode) {
  const p = new URLSearchParams();
  if (filterKey !== "") {
    p.set("categoryUrl", filterKey);
  }
  if (path === "/analytics/top-products") {
    p.set("limit", String(TOP_PRODUCTS_UI_FETCH_LIMIT));
  }
  if (path === "/analytics/opportunities") {
    p.set("limit", String(OPPORTUNITIES_UI_FETCH_LIMIT));
    p.set("mode", opportunityMode ?? "classic");
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export const ANALYTICS_REPORT_TABS = [
  { id: "top", label: "Top Products", path: "/analytics/top-products", key: "top" },
  { id: "opp", label: "Opportunities", path: "/analytics/opportunities", key: "opp" },
  { id: "score", label: "Product Score", path: "/analytics/product-score", key: "score" },
  { id: "growth", label: "📈 Em Ascensão", path: "/analytics/growth", key: "growth" },
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
    growth: null,
    scale: null,
    map: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** Heurísticas do relatório Opportunities — enviado como `mode` na query. */
  const [opportunityMode, setOpportunityMode] = useState(/** @type {OpportunityMode} */ ("classic"));
  /** Filtro rápido Ticket (client-side) partilhado — Creator Presets e barras por aba. */
  const [ticketTier, setTicketTier] = useState(/** @type {TicketFilterMode} */ ("all"));

  const filterKey = categoryUrl != null ? String(categoryUrl).trim() : "";

  useEffect(() => {
    setCache({
      top: null,
      opp: null,
      score: null,
      growth: null,
      scale: null,
      map: null
    });
    setOpportunityMode("classic");
    setTicketTier("all");
    setError(null);
    setLoading(false);
  }, [filterKey]);

  const current = ANALYTICS_REPORT_TABS.find((t) => t.id === tab);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const q = buildAnalyticsQuery(current.path, filterKey, opportunityMode);
      const json = await apiFetch(`${current.path}${q}`);
      setCache((c) => ({ ...c, [current.key]: json }));
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [current, filterKey, opportunityMode]);

  const oppModeDep = tab === "opp" ? opportunityMode : "";

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
    const q = buildAnalyticsQuery(path, filterKey, opportunityMode);
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
  }, [filterKey, tab, current?.key, current?.path, oppModeDep]);

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
      tabs: ANALYTICS_REPORT_TABS,
      opportunityMode,
      setOpportunityMode,
      ticketTier,
      setTicketTier
    }),
    [tab, cache, loading, error, load, setError, opportunityMode, ticketTier]
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
