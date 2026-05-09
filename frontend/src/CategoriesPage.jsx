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
  /** Mensagem global (sucesso / erro). */
  const [scrapeFlash, setScrapeFlash] = useState(/** @type {{ kind: "ok" | "err"; text: string } | null} */ (null));
  /** Cartão que acabou o fluxo completo (pulse curto no botão). */
  const [doneKey, setDoneKey] = useState(/** @type {string | null} */ (null));

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
          text: `${hint} A sincronizar JSON → Postgres (import)…`
        });
      } catch (err) {
        setScrapeFlash({ kind: "err", text: err instanceof Error ? err.message : String(err) });
        return;
      } finally {
        setScrapingKey(null);
      }

      setImportingKey(rowKey);
      try {
        await apiPost("/analytics/import-output", {});
        await reloadCategories();
        setScrapeFlash({
          kind: "ok",
          text: "Coleta gravada, base actualizada e lista de categorias recarregada."
        });
        setDoneKey(rowKey);
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
            Pasta por URL normalizada na base. Escolha uma categoria para abrir os mesmos relatórios de{" "}
            <strong>Analytics</strong>, já filtrados por <code>categoryUrl</code>.
          </p>
        </header>

        <div className="tk-dash-toolbar">
          <span style={{ fontSize: "0.82rem", color: "var(--tk-text-muted)" }}>
            <strong>{status === "ok" ? sortedCategories.length : "—"}</strong> categorias nesta vista
          </span>
          <Link to="/analytics" style={{ color: "var(--tk-accent)" }}>
            Analytics global →
          </Link>
        </div>

        {scrapeFlash ? (
          <p
            role={scrapeFlash.kind === "err" ? "alert" : "status"}
            style={{
              marginTop: "0.65rem",
              fontSize: "0.86rem",
              color: scrapeFlash.kind === "err" ? "var(--tk-danger)" : "var(--tk-accent)",
              maxWidth: "52rem",
              lineHeight: 1.45
            }}
          >
            {scrapeFlash.text}
          </p>
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
                        <span className="tk-category-card__kpi-label">produtos únicos na base</span>
                      </div>
                      <dl className="tk-category-card__meta">
                        <div>
                          <dt title="Snapshots da última importação associados a esta categoria">
                            Última importação
                          </dt>
                          <dd>
                            {row.lastImportProductCount != null
                              ? `${Number(row.lastImportProductCount).toLocaleString("pt-BR")} produtos nesta corrida`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt title="Lojas distintas (produtos ligados à loja na BD) nesta mesma corrida/importação que acima">
                            Lojas nesta corrida
                          </dt>
                          <dd>
                            {row.lastImportSellerCount != null
                              ? `${Number(row.lastImportSellerCount).toLocaleString(
                                  "pt-BR"
                                )} lojas distintas`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Última coleta</dt>
                          <dd>{formatDateTime(row.lastCollectedAt)}</dd>
                        </div>
                        <div>
                          <dt>Actualização</dt>
                          <dd>{formatDateTime(row.lastImportedAt)}</dd>
                        </div>
                        <div>
                          <dt>Criação do run na BD</dt>
                          <dd>{formatDateTime(row.lastScrapeRunCreatedAt)}</dd>
                        </div>
                      </dl>
                    </div>
                  </Link>
                  <footer className="tk-category-card__footer">
                    <button
                      type="button"
                      className="tk-category-card__scrape"
                      disabled={scrapingKey !== null || importingKey !== null}
                      title="Scrape (JSON) + import para Postgres; pode demorar vários minutos"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runScrapeForUrl(scrapeTargetUrl, key);
                      }}
                    >
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
