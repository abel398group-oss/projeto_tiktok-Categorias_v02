import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "./api.js";

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
  if (slug !== "") return slug;
  try {
    const u = new URL(row.categoryKey.startsWith("http") ? row.categoryKey : `https://${row.categoryKey}`);
    const segs = u.pathname.split("/").filter(Boolean);
    const cIdx = segs.findIndex((s) => String(s).toLowerCase() === "c");
    if (cIdx >= 0 && segs[cIdx + 1]) return segs[cIdx + 1];
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

const card = {
  borderRadius: 10,
  border: "1px solid #38444d",
  background: "#15202b",
  overflow: "hidden"
};
const th = {
  padding: "0.5rem 0.65rem",
  textAlign: "left",
  fontSize: "0.76rem",
  fontWeight: 600,
  color: "#cfd9e3",
  borderBottom: "1px solid #2f3f4a",
  whiteSpace: "nowrap"
};
const td = {
  padding: "0.5rem 0.65rem",
  fontSize: "0.82rem",
  borderBottom: "1px solid #243241",
  verticalAlign: "top"
};
const btnLink = {
  display: "inline-block",
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  border: "1px solid #2978b8",
  background: "#1d6fa5",
  color: "#fff",
  fontWeight: 600,
  fontSize: "0.78rem",
  textDecoration: "none"
};

/**
 * Lista de categorias importadas (GET `/analytics/categories`).
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

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "1rem 1.25rem", color: "#e7e9ea" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.35rem" }}>Categorias</h1>
      <p style={{ fontSize: "0.82rem", opacity: 0.78, marginBottom: "1rem", lineHeight: 1.5 }}>
        Categorias já presentes na base (agrupamento da API por URL normalizada). Em <strong>Abrir análise</strong> usa-se o
        mesmo painel de relatórios filtrado por categoria.
      </p>

      {status === "loading" && <p style={{ opacity: 0.88 }}>Carregando categorias…</p>}

      {status === "error" && (
        <p style={{ color: "#f97373", marginTop: "0.5rem" }} role="alert">
          Erro ao carregar: {error}
        </p>
      )}

      {status === "ok" && categories.length === 0 && (
        <p style={{ opacity: 0.88, lineHeight: 1.55, maxWidth: "40rem" }}>{EMPTY_LIST_MSG}</p>
      )}

      {status === "ok" && categories.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Categoria (slug / chave)</th>
                  <th style={th}>Produtos</th>
                  <th style={th}>Última coleta</th>
                  <th style={th}>Última actualização (produto)</th>
                  <th style={th}>Run (criado)</th>
                  <th style={th} aria-label="Acção" />
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => {
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
                  return (
                    <tr key={key}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{label}</div>
                        {row.categorySlug == null || String(row.categorySlug).trim() === "" ? (
                          <div
                            style={{ fontSize: "0.7rem", opacity: 0.65, marginTop: "0.2rem", wordBreak: "break-all" }}
                            title={key}
                          >
                            {key}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                        {row.totalProducts != null ? Number(row.totalProducts).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td style={td}>{formatDateTime(row.lastCollectedAt)}</td>
                      <td style={td}>{formatDateTime(row.lastImportedAt)}</td>
                      <td style={{ ...td, fontSize: "0.76rem", opacity: 0.92 }}>
                        <div>{formatDateTime(row.lastScrapeRunCreatedAt)}</div>
                        {row.lastScrapeRunId != null ? (
                          <div style={{ opacity: 0.65, marginTop: "0.15rem", wordBreak: "break-all" }}>
                            {String(row.lastScrapeRunId)}
                          </div>
                        ) : null}
                      </td>
                      <td style={td}>
                        <Link
                          to={to}
                          state={{
                            categoryUrl: String(row.categoryUrl ?? row.categoryKey ?? key),
                            categoryTitle: label
                          }}
                          style={btnLink}
                        >
                          Abrir análise
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
