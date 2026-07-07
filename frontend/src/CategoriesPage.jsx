import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "./api.js";
import { translateSlugToPt } from "./tiktokCategoryLabelsPt.js";

const EMPTY_LIST_MSG =
  "Nenhuma categoria importada ainda. Rode uma coleta e importe os dados para começar.";
const ASSISTED_COMMAND =
  "npx cross-env ASSISTED_MODE=1 HEADED=1 KEEP_BROWSER_OPEN=1 npm run scraper:worker";

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

/**
 * Constrói o flash a partir da resposta de `POST /analytics/import-output`.
 * @param {unknown} imp
 * @param {string} okText texto quando houve import novo
 * @returns {{ kind: "ok" | "info"; text: string; detailLines?: string[] }}
 */
function buildImportFlash(imp, okText) {
  const impObj = /** @type {Record<string, unknown>} */ (imp ?? {});
  const skipped = Boolean(impObj?.skipped);
  const impMsg = typeof impObj?.message === "string" ? String(impObj.message).trim() : "";
  const detailLines = linesFromImportDetail(impObj?.detail);
  if (skipped) {
    return {
      kind: "info",
      text:
        impMsg ||
        "Import ignorado: o JSON é idêntico ao último import (input_hash). A base e os cartões não mudam até haver dados novos.",
      detailLines: detailLines.length ? detailLines : undefined
    };
  }
  return {
    kind: "ok",
    text: okText,
    detailLines: detailLines.length ? detailLines : undefined
  };
}

/**
 * Página inicial — categorias em grelha de cartões (layout inspirado em dashboards tipo HiperTMS).
 * Dados: GET `/analytics/categories`.
 */
export default function CategoriesPage() {
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'ok' | 'error'} */ ("idle"));
  const [categories, setCategories] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [error, setError] = useState("");

  /** Import JSON → Postgres (não executa TikTok/Puppeteer). */
  const [importBusy, setImportBusy] = useState(false);
  /** Coleta das duas categorias fixas (toolbar, `POST /scrape/run-both`). */
  const [scrapeBusy, setScrapeBusy] = useState(false);
  /** Chave do cartão que está a ser colectado agora (`POST /scrape/run`). */
  const [scrapingCardKey, setScrapingCardKey] = useState(/** @type {string | null} */ (null));
  /** Mensagem global (sucesso / erro / aviso, ex. import ignorado por input_hash). */
  const [flash, setFlash] = useState(
    /** @type {{ kind: "ok" | "err" | "info"; text: string; detailLines?: string[] } | null} */ (null)
  );

  const reloadCategories = useCallback(async () => {
    const body = await apiFetch("/analytics/categories");
    const list = Array.isArray(body?.categories) ? body.categories : [];
    setCategories(list);
  }, []);

  const runImportOnly = useCallback(async () => {
    if (importBusy) return;
    setImportBusy(true);
    setFlash(null);
    try {
      const imp = await apiPost("/analytics/import-output", {});
      await reloadCategories();
      setFlash(buildImportFlash(imp, "Base actualizada a partir do JSON e lista de categorias recarregada."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFlash({ kind: "err", text: `Import falhou: ${msg} Corra na raiz: npm run db:import:output` });
    } finally {
      setImportBusy(false);
    }
  }, [importBusy, reloadCategories]);

  /**
   * Coleta as duas categorias fixas do repo no servidor (`POST /scrape/run-both`)
   * e, no fim, importa o JSON gerado para a base e recarrega os cartões.
   */
  const runScrapeBoth = useCallback(async () => {
    if (scrapeBusy || importBusy || scrapingCardKey) return;
    setScrapeBusy(true);
    setFlash({
      kind: "info",
      text:
        "Coleta iniciada no servidor (2 categorias, headless). Isto pode demorar vários minutos — mantenha o painel aberto."
    });
    try {
      await apiPost("/scrape/run-both", {});
      const imp = await apiPost("/analytics/import-output", {});
      await reloadCategories();
      setFlash(buildImportFlash(imp, "Coleta concluída, base actualizada e cartões recarregados."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFlash({
        kind: "err",
        text:
          `Coleta falhou: ${msg} Se o TikTok exigir login/captcha, use o modo assistido pelo terminal (comando abaixo).`
      });
    } finally {
      setScrapeBusy(false);
    }
  }, [scrapeBusy, importBusy, scrapingCardKey, reloadCategories]);

  /**
   * Coleta uma única categoria já existente (`POST /scrape/run` com o `categoryUrl` do cartão)
   * e importa o resultado para a base.
   * @param {string} categoryUrl
   * @param {string} cardKey
   */
  const runScrapeCard = useCallback(
    async (categoryUrl, cardKey) => {
      if (scrapeBusy || importBusy || scrapingCardKey) return;
      setScrapingCardKey(cardKey);
      setFlash({
        kind: "info",
        text: "Coleta desta categoria iniciada no servidor (headless). Pode demorar alguns minutos."
      });
      try {
        await apiPost("/scrape/run", { categoryUrl });
        const imp = await apiPost("/analytics/import-output", {});
        await reloadCategories();
        setFlash(buildImportFlash(imp, "Coleta da categoria concluída e base actualizada."));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setFlash({ kind: "err", text: `Coleta falhou: ${msg}` });
      } finally {
        setScrapingCardKey(null);
      }
    },
    [scrapeBusy, importBusy, scrapingCardKey, reloadCategories]
  );

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

  const anyBusy = importBusy || scrapeBusy || scrapingCardKey !== null;

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
            <button
              type="button"
              className="tk-btn-soft"
              disabled={anyBusy}
              title="Corre no servidor a coleta das 2 categorias fixas (headless) e importa para a base."
              style={{ borderColor: "#3d7a6a", background: "#1a4a3d", color: "#d8f5ec", fontWeight: 600 }}
              onClick={() => void runScrapeBoth()}
            >
              {scrapeBusy ? "A colectar…" : "Coletar TikTok agora"}
            </button>
            {status === "ok" ? (
              <button
                type="button"
                className="tk-btn-soft"
                disabled={anyBusy}
                title="Importa output/dados_*.json para Postgres (não executa TikTok/Puppeteer)."
                onClick={() => void runImportOnly()}
              >
                {importBusy ? "A importar…" : "Importar JSON → BD"}
              </button>
            ) : null}
            <button
              type="button"
              className="tk-btn-soft"
              disabled={status !== "ok" || anyBusy}
              title="Recarrega os cartões a partir da API."
              onClick={() => void reloadCategories()}
            >
              Recarregar
            </button>
            <Link to="/analytics" style={{ color: "var(--tk-accent)" }}>
              Analytics global →
            </Link>
          </span>
        </div>

        <div style={{ marginTop: "0.65rem", maxWidth: "56rem" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.88, lineHeight: 1.5 }}>
            <strong>Coleta pelo painel:</strong> use <strong>Coletar TikTok agora</strong> (2 categorias) ou o botão{" "}
            <em>Coletar agora</em> em cada cartão. Corre no servidor em modo headless e importa para a base no fim.
            Se o TikTok pedir <strong>login/captcha</strong>, use o modo assistido pelo terminal:
          </p>
          <pre
            style={{
              margin: "0.5rem 0 0",
              padding: "0.55rem 0.65rem",
              fontSize: "0.78rem",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--tk-text-muted)",
              background: "rgba(0,0,0,0.18)",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.06)"
            }}
          >
            {ASSISTED_COMMAND}
          </pre>
          <p style={{ margin: "0.45rem 0 0", fontSize: "0.78rem", opacity: 0.82, lineHeight: 1.5 }}>
            O navegador abrirá em <code>/br/c</code>. Navegue manualmente até a subcategoria final, pressione ENTER no terminal e depois importe o JSON para o banco.
          </p>
        </div>

        {flash ? (
          <div style={{ marginTop: "0.65rem", maxWidth: "52rem" }}>
            <p
              role={flash.kind === "err" ? "alert" : "status"}
              style={{
                margin: 0,
                fontSize: "0.86rem",
                color:
                  flash.kind === "err"
                    ? "var(--tk-danger)"
                    : flash.kind === "info"
                      ? "#fbbf24"
                      : "var(--tk-accent)",
                lineHeight: 1.45
              }}
            >
              {flash.text}
            </p>
            {flash.detailLines && flash.detailLines.length > 0 ? (
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
                {flash.detailLines.join("\n")}
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
                      disabled={anyBusy}
                      title="Recolhe esta categoria no servidor (headless) e importa para a base."
                      onClick={() =>
                        void runScrapeCard(String(row.categoryUrl ?? row.categoryKey ?? key), key)
                      }
                    >
                      {scrapingCardKey === key ? "A colectar…" : "Coletar agora"}
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
