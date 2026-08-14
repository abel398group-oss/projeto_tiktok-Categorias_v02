/**
 * App.jsx — Ponto de entrada da SPA + componente AnalyticsDashboard.
 *
 * Os componentes de tabela foram movidos para ficheiros separados:
 *   TableTop.jsx / TableOpp.jsx / TableScore.jsx / TableGrowth.jsx /
 *   TableCategoryMap.jsx / TableScalableSections.jsx / tableShared.jsx
 */
import { Suspense, lazy, useState, useCallback, useMemo } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AnalyticsDashboardCacheProvider, useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import AppShell from "./AppShell.jsx";
import BuscarPage from "./BuscarPage.jsx";
import EstatisticasPage from "./EstatisticasPage.jsx";
import LojasPage from "./LojasPage.jsx";
import ParametrosPage from "./ParametrosPage.jsx";
import CategoriesPage from "./CategoriesPage.jsx";
import HandsOnPage from "./HandsOnPage.jsx";
import ProductWorkspacePage from "./ProductWorkspacePage.jsx";
import RankingPage from "./RankingPage.jsx";
import ShortlistPage from "./ShortlistPage.jsx";
import { localizeCategoryBread } from "./mapCategoryUi.js";

import TableTop from "./TableTop.jsx";
import TableOpp from "./TableOpp.jsx";
import TableScore from "./TableScore.jsx";
import TableGrowth from "./TableGrowth.jsx";
import TableCategoryMap from "./TableCategoryMap.jsx";
import TableScalableSections from "./TableScalableSections.jsx";

const CategoryAnalyticsPage = lazy(() => import("./CategoryAnalyticsPage.jsx"));

/** Atalhos só de UI: mudam aba, `mode` da API (Opportunities) e filtro Ticket partilhado — sem novos endpoints. */
const CREATOR_PRESETS = [
  { id: "starter", emoji: "🔥", label: "Creator Starter", tabId: "opp", opportunityMode: "low_sales", ticket: "medio" },
  { id: "momentum", emoji: "📈", label: "Momentum", tabId: "growth", ticket: "medio_alto" },
  { id: "gems", emoji: "💎", label: "Hidden Gems", tabId: "opp", opportunityMode: "below_median", ticket: "medio" },
  { id: "test", emoji: "🧪", label: "Produtos para Teste", tabId: "score", ticket: "baixo_medio" },
  { id: "tickethigh", emoji: "💰", label: "Ticket Alto", tabId: "score", ticket: "alto" }
];

export function AnalyticsDashboard({ variant = "global", pageTitle, categoryBread }) {
  const {
    tab, setTab, cache, loading, error, load, tabs, setError, setOpportunityMode, setTicketTier
  } = useAnalyticsDashboardCache();

  const applyCreatorPreset = useCallback(
    (p) => {
      setError(null);
      setTab(p.tabId);
      if ("opportunityMode" in p && p.opportunityMode != null) setOpportunityMode(p.opportunityMode);
      setTicketTier(p.ticket);
    },
    [setTab, setOpportunityMode, setTicketTier, setError]
  );

  const current = tabs.find((t) => t.id === tab);
  const data = current ? cache[current.key] : null;
  const heading = pageTitle ?? "Analytics (API)";

  const categoryBreadDisplay = useMemo(
    () => (categoryBread ? localizeCategoryBread(categoryBread) : null),
    [categoryBread]
  );

  const showSubLine =
    categoryBread &&
    categoryBread.subcategory !== categoryBread.masterCategory &&
    categoryBread.subcategory !== "—";

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        {variant === "category" ? (
          <p style={{ marginBottom: "0.65rem" }}>
            <Link to="/" style={{ color: "var(--tk-accent)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 }}>← Voltar ao início</Link>
          </p>
        ) : null}
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.03em", marginTop: 0, marginBottom: "0.5rem", color: "var(--tk-text)" }}>
          {heading}
        </h1>
        {variant === "category" && categoryBread && categoryBreadDisplay ? (
          <div style={{ fontSize: "0.86rem", lineHeight: 1.48, marginBottom: "0.55rem", padding: "0.6rem 0.85rem", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-raised)", color: "var(--tk-text-muted)" }} aria-label="Pasta TikTok derivada da URL da categoria">
            <p style={{ margin: "0 0 0.25rem", opacity: 0.92 }}><span style={{ opacity: 0.7 }}>Categoria principal:</span>{" "}<strong>{categoryBreadDisplay.masterCategory}</strong></p>
            {showSubLine ? (<p style={{ margin: 0, opacity: 0.92 }}><span style={{ opacity: 0.7 }}>Subcategoria:</span>{" "}<strong>{categoryBreadDisplay.subcategory}</strong></p>) : null}
          </div>
        ) : null}
        {variant === "category" ? (
          <>
            <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>Relatórios filtrados com <code>categoryUrl</code> na API. O separador activo <strong>carrega automaticamente</strong>. Use <strong>Carregar dados</strong> para actualizar só o separador actual.</p>
            <p style={{ fontSize: "0.72rem", opacity: 0.68, marginTop: "0.35rem", lineHeight: 1.48, maxWidth: "46rem" }}>Para ver <strong>todos</strong> os produtos, use <Link to="/analytics" style={{ color: "var(--tk-accent)", fontWeight: 500 }}>Analytics</Link> global.</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>Métricas em GET pelo Fastify · export Space e página por produto. Proxy do Vite em dev para evitar CORS.</p>
            <p style={{ fontSize: "0.72rem", opacity: 0.68, marginTop: "0.35rem", lineHeight: 1.48, maxWidth: "46rem" }}>
              <strong>Resumo:</strong> Top = ranque servidor por vendas · Opportunities = regras por modo · Product Score = ranking 0–100 · Em Ascensão = comparativo dois runs · Escalar = dois grupos de foco · Mapa = força das categorias.
            </p>
            <p style={{ fontSize: "0.72rem", opacity: 0.66, marginTop: "0.35rem", lineHeight: 1.45, maxWidth: "46rem" }}>O separador activo <strong>carrega automaticamente</strong>. Use <strong>Carregar dados</strong> para actualizar.</p>
          </>
        )}

        {/* Creator Presets */}
        <section style={{ marginBottom: "1rem", padding: "0.85rem 1rem", borderRadius: "var(--tk-radius-lg)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-raised)" }} aria-label="Creator Presets">
          <h2 style={{ fontSize: "0.92rem", fontWeight: 600, margin: "0 0 0.55rem 0", color: "var(--tk-text)" }}>🎯 Creator Presets</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "stretch" }}>
            {CREATOR_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => applyCreatorPreset(p)}
                style={{ padding: "0.42rem 0.75rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface)", color: "var(--tk-text)", fontWeight: 500, fontSize: "0.78rem", lineHeight: 1.35, textAlign: "left", boxShadow: "var(--tk-shadow-sm)" }}>
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.72rem", opacity: 0.78, lineHeight: 1.45, maxWidth: "48rem" }}>Os presets apenas organizam filtros e relatórios já existentes para acelerar análise creator.</p>
        </section>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
          {tabs.map((t) => (
            <button key={t.id} type="button"
              onClick={() => { setTab(t.id); setError(null); }}
              style={{ padding: "0.48rem 0.92rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: tab === t.id ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)", background: tab === t.id ? "var(--tk-accent-soft)" : "var(--tk-surface)", color: "var(--tk-text)", fontWeight: tab === t.id ? 600 : 500, fontSize: "0.82rem", boxShadow: tab === t.id ? "var(--tk-shadow-sm)" : "none", transition: "background 0.12s ease, border-color 0.12s ease" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <button type="button" onClick={() => load()} disabled={loading}
            style={{ padding: "0.45rem 1.1rem", cursor: loading ? "wait" : "pointer", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-btn-primary-hover)", background: loading ? "var(--tk-btn-primary-hover)" : "var(--tk-btn-primary)", color: "#fff", fontWeight: 600, fontSize: "0.85rem", boxShadow: "var(--tk-shadow-sm)" }}>
            {loading ? "Carregando..." : "Carregar dados"}
          </button>
        </div>

        {error && <p style={{ color: "var(--tk-danger)", marginTop: "0.5rem" }}>Erro: {error}</p>}
        {loading && <p style={{ marginTop: "0.5rem" }}>Carregando...</p>}

        {!loading && tab === "top"    && <TableTop data={data} />}
        {!loading && tab === "opp"    && <TableOpp data={data} />}
        {!loading && tab === "score"  && <TableScore data={data} />}
        {!loading && tab === "growth" && <TableGrowth data={data} />}
        {!loading && tab === "scale"  && <TableScalableSections data={data} />}
        {!loading && tab === "map"    && <TableCategoryMap data={data} />}
      </div>
    </main>
  );
}

/** Endereço que não existe: diz onde se está e oferece a saída. */
function PaginaNaoEncontrada() {
  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 0.4rem" }}>
          Página não encontrada
        </h1>
        <p style={{ opacity: 0.85, lineHeight: 1.5 }}>
          O endereço <code>{window.location.pathname}</code> não existe neste painel.
        </p>
        <p style={{ marginTop: "0.8rem" }}>
          <Link to="/" className="tk-nav-link">
            ← Voltar às categorias
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<CategoriesPage />} />
          <Route path="categorias" element={<Navigate to="/" replace />} />
          <Route
            path="analytics"
            element={
              <AnalyticsDashboardCacheProvider>
                <AnalyticsDashboard />
              </AnalyticsDashboardCacheProvider>
            }
          />
          <Route
            path="categoria/:categorySlug"
            element={
              <Suspense fallback={<main className="tk-page-body"><div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}><p style={{ opacity: 0.85 }}>Carregando…</p></div></main>}>
                <CategoryAnalyticsPage />
              </Suspense>
            }
          />
          <Route path="ranking" element={<RankingPage />} />
          <Route path="buscar" element={<BuscarPage />} />
          <Route path="estatisticas" element={<EstatisticasPage />} />
          <Route path="lojas" element={<LojasPage />} />
          <Route path="parametros" element={<ParametrosPage />} />
          <Route path="a-mao" element={<HandsOnPage />} />
          <Route path="shortlist" element={<ShortlistPage />} />
          <Route path="produto/:productId" element={<ProductWorkspacePage />} />
          {/* Sem esta rota, um endereço errado montava a app vazia: página em
              branco, sem explicação e sem caminho de volta. Encontrado pelo
              smoke test de rotas. */}
          <Route path="*" element={<PaginaNaoEncontrada />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
