import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "./api.js";
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

/**
 * Página inicial — categorias em grelha de cartões (layout inspirado em dashboards tipo HiperTMS).
 * Dados: GET `/analytics/categories`.
 */
export default function CategoriesPage() {
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'ok' | 'error'} */ ("idle"));
  const [categories, setCategories] = useState(/** @type {Array<Record<string, unknown>>} */ ([]));
  const [error, setError] = useState("");

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

              return (
                <Link
                  key={key}
                  to={to}
                  state={statePayload}
                  className="tk-category-card"
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
                  <footer className="tk-category-card__footer">
                    <span className="tk-category-card__cta">Abrir análise →</span>
                  </footer>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
