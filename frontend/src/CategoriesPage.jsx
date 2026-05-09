import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";
import { translateSlugToPt } from "./tiktokCategoryLabelsPt.js";

const EMPTY_LIST_MSG =
  "Nenhuma categoria importada ainda. Rode uma coleta e importe os dados para começar.";

/**
 * Segmento estável para a rota `/categoria/:categorySlug`.
 * Preferimos o slug TikTok quando existe; senão a chave normalizada (única por bucket na API).
 * @param {{ categorySlug?: string | null, categoryKey: string }} row
 */
export function categoryToPathSegment(row) {
  const slug = row.categorySlug != null ? String(row.categorySlug).trim() : "";
  if (slug !== "") return slug;
  return row.categoryKey;
}

/** Nome curto para a listagem — slug legível quando existe. */
export function categoryDisplayLabel(row) {
  const slug = row.categorySlug != null ? String(row.categorySlug).trim() : "";
  if (slug !== "") {
    const pt = translateSlugToPt(slug);
    return pt || slug.replace(/-/g, " ").replace(/\s+/g, " ").trim() || slug;
  }
  try {
    const u = new URL(row.categoryKey.startsWith("http") ? row.categoryKey : `https://${row.categoryKey}`);
    const segs = u.pathname.split("/").filter(Boolean);
    const cIdx = segs.findIndex((s) => String(s).toLowerCase() === "c");
    if (cIdx >= 0 && segs[cIdx + 1]) {
      const leaf = String(segs[cIdx + 1]);
      const pt = translateSlugToPt(leaf);
      return pt || (leaf.replace(/-/g, " ").replace(/\s+/g, " ").trim() || leaf);
    }
    return segs[segs.length - 1] || row.categoryKey;
  } catch {
    return row.categoryKey.length > 48 ? `${row.categoryKey.slice(0, 45)}…` : row.categoryKey;
  }
}

function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

/** Relativo curto para operação (ex. "há 12 min"). */
function formatRelativeAgoPt(iso) {
  if (iso == null || iso === "") return null;
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 45) return "agora há pouco";
    if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `há ${Math.floor(sec / 3600)} h`;
    return `há ${Math.floor(sec / 86400)} d`;
  } catch {
    return null;
  }
}

function formatIntLocale(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("pt-BR");
}

/**
 * Só alertas que mudam a decisão do operador (sem ruído quando está tudo normal).
 * @param {Record<string, unknown>} row
 */
function buildCategoryAlertBadges(row) {
  const health = String(row.operationalHealth ?? "ok");
  /** @type {Array<{ text: string; tone: string }>} */
  const out = [];
  if (health === "partial_run") {
    out.push({ text: "Coleta incompleta", tone: "warn" });
  }
  if (health === "stale_collection") {
    out.push({ text: "Desactualizado", tone: "stale" });
  }
  if (health === "mixed_urls") {
    out.push({ text: "URLs misturadas", tone: "info" });
  }
  return out;
}

/** Linhas técnicas vindas de `POST /analytics/import-output` (`detail`). */
function linesFromImportDetail(detail) {
  if (detail == null || typeof detail !== "object") return [];
  const d = /** @type {Record<string, unknown>} */ (detail);
  const lines = [];
  const existing = d.existingScrapeRunId != null ? String(d.existingScrapeRunId).trim() : "";
  const hash = d.inputHash != null ? String(d.inputHash).trim() : "";
  const run = d.scrapeRunId != null ? String(d.scrapeRunId).trim() : "";
  if (existing) lines.push(`ScrapeRun já na BD (mesmo conteúdo): ${existing}`);
  if (hash) lines.push(`input_hash: ${hash}`);
  if (run) lines.push(`Novo ScrapeRun: ${run}`);
  return lines;
}

/** Resumo curto do `POST /scrape/run` para ver pasta e consolidação. */
function scrapeRunSummary(body) {
  if (body == null || typeof body !== "object") return "";
  const b = /** @type {Record<string, unknown>} */ (body);
  const od = typeof b.outputDir === "string" ? b.outputDir.trim() : "";
  if (!od) return "";
  const cons = Boolean(b.consolidated);
  return ` · OUTPUT_DIR=${od}${cons ? " · depois consolidate → output/dados_*.json" : ""}`;
}

/** Ícone cadeado (toolbar) quando scrape/import corre noutro sítio — alinhado ao bloqueio dos cartões. */
function ScrapeLockGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, opacity: 0.88 }}
    >
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
    </svg>
  );
}

/** Alinhado à validação do POST `/scrape/run` na API (hostname exacto). */
function isShopTikTokCategoryUrl(s) {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" && u.hostname === "shop.tiktok.com";
  } catch {
    return false;
  }
}

/**
 * Página inicial — categorias em grelha de cartões (layout inspirado em dashboards tipo HiperTMS).
 * Dados: GET `/analytics/categories`.
 */
export default function CategoriesPage() {
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'ok' | 'error'} */ ("idle"));
  const [categories, setCategories] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [error, setError] = useState("");

  /** `categoryKey` do cartão enquanto corre o scrape, ou `null`. */
  const [scrapingKey, setScrapingKey] = useState(/** @type {string | null} */ (null));
  /** Mesmo cartão enquanto corre import JSON → Postgres após scrape OK. */
  const [importingKey, setImportingKey] = useState(/** @type {string | null} */ (null));
  /** Mensagem global (sucesso / erro / aviso, ex. import ignorado por input_hash). */
  const [scrapeFlash, setScrapeFlash] = useState(
    /** @type {{ kind: "ok" | "err" | "info"; text: string; detailLines?: string[] } | null} */ (null)
  );
  /** Cartão que acabou o fluxo completo (pulse curto no botão). */
  const [doneKey, setDoneKey] = useState(/** @type {string | null} */ (null));
  /** Fluxo `scrape-both` + consolidate + import (duas categorias fixas do repo). */
  const [bulkBothBusy, setBulkBothBusy] = useState(false);

  const workflowBusy = scrapingKey !== null || importingKey !== null || bulkBothBusy;
  /** Toolbar «duas categorias» bloqueada por scrape/import num cartão (não pelo próprio fluxo bulk). */
  const bulkLockedByCard = (scrapingKey !== null || importingKey !== null) && !bulkBothBusy;

  useEffect(() => {
    if (!doneKey) return undefined;
    const t = window.setTimeout(() => setDoneKey(null), 2800);
    return () => window.clearTimeout(t);
  }, [doneKey]);

  const reloadCategories = useCallback(async () => {
    const body = await apiFetch("/analytics/categories");
    const list = Array.isArray(body?.categories) ? body.categories : [];
    setCategories(list);
  }, []);

  /**
   * @param {string} categoryUrl URL da categoria (ex.: `row.categoryUrl`).
   * @param {string} rowKey `categoryKey` estável do cartão.
   */
  const runScrapeForUrl = useCallback(
    async (categoryUrl, rowKey) => {
      const u = String(categoryUrl ?? "").trim();
      if (!isShopTikTokCategoryUrl(u)) {
        setScrapeFlash({
          kind: "err",
          text: "Esta categoria não tem uma URL https://shop.tiktok.com/… válida na base — não é possível scrapear daqui."
        });
        return;
      }
      setScrapingKey(rowKey);
      setImportingKey(null);
      setScrapeFlash(null);
      setDoneKey(null);
      try {
        const body = await apiPost("/scrape/run", { categoryUrl: u });
        const hint =
          typeof body?.message === "string" && body.message.trim() !== "" ? body.message.trim() : "Coleta concluída.";
        setScrapeFlash({
          kind: "ok",
          text: `${hint}${scrapeRunSummary(body)} A sincronizar JSON → Postgres (import)…`
        });
      } catch (err) {
        setScrapeFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
        return;
      } finally {
        setScrapingKey(null);
      }

      setImportingKey(rowKey);
      try {
        const imp = await apiPost("/analytics/import-output", {});
        await reloadCategories();
        const impObj = /** @type {Record<string, unknown>} */ (imp);
        const skipped = Boolean(impObj?.skipped);
        const impMsg =
          typeof impObj?.message === "string" ? String(impObj.message).trim() : "";
        const detailLines = linesFromImportDetail(impObj?.detail);
        if (skipped) {
          setScrapeFlash({
            kind: "info",
            text:
              impMsg ||
              "Import ignorado: o JSON é idêntico ao último import (input_hash). A coleta correu, mas a base e os cartões não mudam até haver dados novos.",
            detailLines: detailLines.length ? detailLines : undefined
          });
        } else {
          setScrapeFlash({
            kind: "ok",
            text: "Coleta gravada, base actualizada e lista de categorias recarregada.",
            detailLines: detailLines.length ? detailLines : undefined
          });
          setDoneKey(rowKey);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setScrapeFlash({
          kind: "err",
          text: `Coleta terminou, mas o import falhou: ${msg} Corra na raiz: npm run db:import:output`
        });
      } finally {
        setImportingKey(null);
      }
    },
    [reloadCategories]
  );

  /** Mesmas URLs que `npm run coleta` (grelha): `scripts/scrape-both.mjs` + consolidação + import. */
  const runBothCategories = useCallback(async () => {
    setBulkBothBusy(true);
    setScrapeFlash(null);
    setDoneKey(null);
    try {
      setScrapeFlash({
        kind: "ok",
        text: "A correr as duas coletas (script scrape-both) e a consolidar output/dados_*.json…"
      });
      const bothBody = await apiPost("/scrape/run-both", {});
      setScrapeFlash({
        kind: "ok",
        text: `Colectas e consolidação concluídas.${scrapeRunSummary(bothBody)} A sincronizar JSON → Postgres (import)…`
      });
      const imp = await apiPost("/analytics/import-output", {});
      await reloadCategories();
      const impObj = /** @type {Record<string, unknown>} */ (imp);
      const skipped = Boolean(impObj?.skipped);
      const impMsg = typeof impObj?.message === "string" ? String(impObj.message).trim() : "";
      const detailLines = linesFromImportDetail(impObj?.detail);
      if (skipped) {
        setScrapeFlash({
          kind: "info",
          text:
            impMsg ||
            "Import ignorado (mesmo input_hash): as duas coletas e a consolidação terminaram, mas a base não mudou — os números/datas dos cartões ficam iguais.",
          detailLines: detailLines.length ? detailLines : undefined
        });
      } else {
        setScrapeFlash({
          kind: "ok",
          text: "Duas categorias colectadas, consolidadas, base actualizada e lista recarregada.",
          detailLines: detailLines.length ? detailLines : undefined
        });
        setDoneKey("__both__");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScrapeFlash({
        kind: "err",
        text: `Fluxo duas categorias falhou: ${msg}`
      });
    } finally {
      setBulkBothBusy(false);
    }
  }, [reloadCategories]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    apiFetch("/analytics/categories")
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.categories) ? body.categories : [];
        setCategories(list);
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setCategories([]);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedCategories = useMemo(() => {
    return [...categories].sort(
      (a, b) => Number(b.totalProducts ?? 0) - Number(a.totalProducts ?? 0)
    );
  }, [categories]);

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap">
        <header className="tk-dash-header">
          <p className="tk-dash-header__eyebrow">Painel inicial</p>
          <h1>Categorias</h1>
          <p>
            Resumo operacional por categoria na base. Abra <strong>Analytics</strong> por cartão para relatórios
            filtrados por <code>categoryUrl</code>.
          </p>
        </header>

        <div className="tk-dash-toolbar">
          <span style={{ fontSize: "0.82rem", color: "var(--tk-text-muted)" }}>
            <strong>{status === "ok" ? sortedCategories.length : "—"}</strong> categorias nesta vista
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
            {status === "ok" ? (
              <button
                type="button"
                className="tk-btn-soft"
                disabled={workflowBusy}
                title={
                  bulkLockedByCard
                    ? "Aguarde: já há um scrape ou import a correr num cartão. Este botão fica bloqueado como os outros cartões."
                    : "Equiv. a `npm run coleta` sem passos extra: duas URLs fixas em scripts/scrape-both.mjs, depois consolidação e import."
                }
                onClick={() => void runBothCategories()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                {bulkLockedByCard ? <ScrapeLockGlyph /> : null}
                {bulkBothBusy ? "A correr duas…" : "Scrapear as duas categorias"}
              </button>
            ) : null}
            <Link to="/analytics" style={{ color: "var(--tk-accent)" }}>
              Analytics global →
            </Link>
          </span>
        </div>

        {scrapeFlash ? (
          <div style={{ marginTop: "0.65rem", maxWidth: "52rem" }}>
            <p
              role={scrapeFlash.kind === "err" ? "alert" : "status"}
              style={{
                margin: 0,
                fontSize: "0.86rem",
                color:
                  scrapeFlash.kind === "err"
                    ? "var(--tk-danger)"
                    : scrapeFlash.kind === "info"
                      ? "#fbbf24"
                      : "var(--tk-accent)",
                lineHeight: 1.45
              }}
            >
              {scrapeFlash.text}
            </p>
            {scrapeFlash.detailLines && scrapeFlash.detailLines.length > 0 ? (
              <pre
                style={{
                  margin: "0.45rem 0 0",
                  padding: "0.5rem 0.65rem",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: "var(--tk-text-muted)",
                  background: "rgba(0,0,0,0.18)",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.06)"
                }}
              >
                {scrapeFlash.detailLines.join("\n")}
              </pre>
            ) : null}
          </div>
        ) : null}

        {status === "loading" && <p style={{ color: "var(--tk-text-muted)" }}>Carregando categorias…</p>}

        {status === "error" && (
          <p style={{ color: "var(--tk-danger)", marginTop: "0.5rem" }} role="alert">
            Erro ao carregar: {error}
          </p>
        )}

        {status === "ok" && sortedCategories.length === 0 && (
          <p style={{ color: "var(--tk-text-muted)", lineHeight: 1.55, maxWidth: "40rem" }}>{EMPTY_LIST_MSG}</p>
        )}

        {status === "ok" && sortedCategories.length > 0 && (
          <section className="tk-category-grid" aria-label="Categorias importadas">
            {sortedCategories.map((row) => {
              const key = String(row.categoryKey ?? row.categoryUrl ?? "");
              const segment = categoryToPathSegment({
                categorySlug: row.categorySlug,
                categoryKey: key
              });
              const to = `/categoria/${encodeURIComponent(segment)}`;
              const label = categoryDisplayLabel({
                categorySlug: row.categorySlug,
                categoryKey: key
              });
              const n =
                row.totalProducts != null
                  ? Number(row.totalProducts).toLocaleString("pt-BR")
                  : "—";
              const showKey =
                row.categorySlug == null || String(row.categorySlug).trim() === "";

              const statePayload = {
                categoryUrl: String(row.categoryUrl ?? row.categoryKey ?? key),
                categoryTitle: label
              };

              const scrapeTargetUrl = String(row.categoryUrl ?? row.categoryKey ?? key).trim();

              const jt = row.lastRunJsonTotal != null ? Number(row.lastRunJsonTotal) : NaN;
              const imp = row.lastImportProductCount != null ? Number(row.lastImportProductCount) : NaN;
              const outsideApprox =
                Number.isFinite(jt) && Number.isFinite(imp) && jt > imp ? Math.floor(jt - imp) : null;
              const alertBadges = buildCategoryAlertBadges(row);

              return (
                <div key={key} className="tk-category-card">
                  <Link
                    to={to}
                    state={statePayload}
                    className="tk-category-card__main"
                    aria-label={`Abrir análise da categoria ${label}`}
                  >
                    <div className="tk-category-card__body">
                      <p className="tk-category-card__eyebrow">Categoria</p>
                      <h2 className="tk-category-card__title">{label}</h2>
                      {showKey ? (
                        <p className="tk-category-card__key" title={key}>
                          {key.length > 120 ? `${key.slice(0, 117)}…` : key}
                        </p>
                      ) : null}
                      <div className="tk-category-card__kpi">
                        <span className="tk-category-card__kpi-val">{n}</span>
                        <span className="tk-category-card__kpi-label">produtos na base</span>
                      </div>

                      <div className="tk-category-card__summary" aria-label="Resumo da última coleta">
                        <p className="tk-category-card__summary-title">Última coleta</p>
                        <ul className="tk-category-card__summary-list">
                          {row.lastRunJsonTotal != null ? (
                            <li>
                              <strong>{formatIntLocale(row.lastRunJsonTotal)}</strong> colectados no total
                            </li>
                          ) : null}
                          <li>
                            <strong>{formatIntLocale(row.lastImportProductCount)}</strong> importados nesta
                            categoria
                            <span className="tk-category-card__summary-sep"> · </span>
                            <strong>{formatIntLocale(row.lastImportSellerCount)}</strong> lojas
                          </li>
                          {row.lastRunNewProductsApprox != null && row.lastRunUpdatedProductsApprox != null ? (
                            <li
                              title="Estimativa: data da coleta no JSON alinhada à primeira vez que o produto apareceu na base."
                            >
                              <strong className="tk-category-card__accent-pos">
                                +{formatIntLocale(row.lastRunNewProductsApprox)}
                              </strong>{" "}
                              novos
                              <span className="tk-category-card__summary-sep"> · </span>
                              <strong>{formatIntLocale(row.lastRunUpdatedProductsApprox)}</strong> actualizados
                            </li>
                          ) : null}
                          {outsideApprox != null && outsideApprox > 0 ? (
                            <li>
                              <strong>{formatIntLocale(outsideApprox)}</strong> fora desta categoria / dedupe
                            </li>
                          ) : null}
                          <li>
                            Última coleta: {formatDateTime(row.lastCollectedAt)}
                            {formatRelativeAgoPt(row.lastCollectedAt) ? (
                              <span className="tk-category-card__summary-note">
                                {" "}
                                ({formatRelativeAgoPt(row.lastCollectedAt)})
                              </span>
                            ) : null}
                          </li>
                        </ul>
                      </div>

                      {alertBadges.length > 0 ? (
                        <div className="tk-category-card__badges" aria-label="Alertas">
                          {alertBadges.map((b, i) => (
                            <span
                              key={`${b.text}-${i}`}
                              className={`tk-category-card__badge tk-category-card__badge--${b.tone}`}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <details className="tk-category-card__details">
                        <summary>Detalhes técnicos</summary>
                        <dl className="tk-category-card__details-dl">
                          <div>
                            <dt>Hash do import</dt>
                            <dd>
                              {row.lastRunInputHashPreview ? (
                                <code className="tk-category-card__code">{String(row.lastRunInputHashPreview)}</code>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>ID do import (BD)</dt>
                            <dd>
                              {row.lastScrapeRunId ? (
                                <code className="tk-category-card__code">{String(row.lastScrapeRunId)}</code>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Estado no JSON</dt>
                            <dd>
                              <code className="tk-category-card__code">{row.lastRunStatus ?? "—"}</code>
                            </dd>
                          </div>
                          {row.lastRunFilterNote ? (
                            <div>
                              <dt>Nota / filtro</dt>
                              <dd className="tk-category-card__details-note">{String(row.lastRunFilterNote)}</dd>
                            </div>
                          ) : null}
                          {row.jsonRunCoveragePercent != null ? (
                            <div>
                              <dt>Parte no total do ficheiro</dt>
                              <dd>~{Number(row.jsonRunCoveragePercent)}% (import multi-categoria)</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt>Actualização na base</dt>
                            <dd>{formatDateTime(row.lastImportedAt)}</dd>
                          </div>
                          <div>
                            <dt>Registo do import</dt>
                            <dd>{formatDateTime(row.lastScrapeRunCreatedAt)}</dd>
                          </div>
                        </dl>
                      </details>
                    </div>
                  </Link>
                  <footer className="tk-category-card__footer">
                    <button
                      type="button"
                      className="tk-category-card__scrape"
                      disabled={workflowBusy}
                      title={
                        workflowBusy && scrapingKey !== key && importingKey !== key
                          ? "Outro scrape, import ou fluxo «duas categorias» está em curso — aguarde."
                          : "Scrape (JSON) + import para Postgres; pode demorar vários minutos"
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runScrapeForUrl(scrapeTargetUrl, key);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem"
                      }}
                    >
                      {workflowBusy && scrapingKey !== key && importingKey !== key ? <ScrapeLockGlyph /> : null}
                      {scrapingKey === key
                        ? "A scrapear…"
                        : importingKey === key
                          ? "A importar…"
                          : doneKey === key
                            ? "Concluído ✓"
                            : "Scrapear"}
                    </button>
                    <Link to={to} state={statePayload} className="tk-category-card__cta">
                      Abrir análise →
                    </Link>
                  </footer>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
