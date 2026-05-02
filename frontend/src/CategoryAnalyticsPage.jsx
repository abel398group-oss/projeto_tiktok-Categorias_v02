import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiFetch } from "./api.js";
import { AnalyticsDashboardCacheProvider } from "./analyticsDashboardCache.jsx";
import { AnalyticsDashboard } from "./App.jsx";
import { categoryDisplayLabel, categoryToPathSegment } from "./CategoriesPage.jsx";

/**
 * Resolve `categorySlug` da URL contra a lista da API ou estado vindo da lista de categorias.
 * @param {Array<Record<string, unknown>>} categories
 * @param {string} rawSlugParam valor de useParams() (pode vir URL-encoded no segmento)
 */
function findCategoryForSlug(categories, rawSlugParam) {
  let decoded = rawSlugParam ?? "";
  try {
    decoded = rawSlugParam != null ? decodeURIComponent(rawSlugParam) : "";
  } catch {
    decoded = rawSlugParam ?? "";
  }
  const raw = rawSlugParam ?? "";

  for (const row of categories) {
    const key = String(row.categoryKey ?? row.categoryUrl ?? "");
    const segment = categoryToPathSegment({
      categorySlug: row.categorySlug,
      categoryKey: key
    });
    if (segment === decoded) return row;
    if (encodeURIComponent(segment) === raw) return row;
  }
  return null;
}

/** Título quando não há `categoryTitle` em location.state. */
function titleFromDecodedSegment(decoded) {
  if (!decoded || !String(decoded).trim()) return "Categoria";
  const s = String(decoded).trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const segs = new URL(s).pathname.split("/").filter(Boolean);
      const cIdx = segs.findIndex((x) => String(x).toLowerCase() === "c");
      if (cIdx >= 0 && segs[cIdx + 1]) {
        return humanizeHyphenSlug(segs[cIdx + 1]);
      }
    } catch {
      /* noop */
    }
  }
  return humanizeHyphenSlug(s);
}

function humanizeHyphenSlug(seg) {
  return String(seg)
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Analytics por categoria — mesmo painel global com `categoryUrl` na API.
 */
export default function CategoryAnalyticsPage() {
  const { categorySlug } = useParams();
  const location = useLocation();
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'ready' | 'missing' | 'error'} */ ("idle"));
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [resolvedTitle, setResolvedTitle] = useState("");
  /** @type {string | null} */
  const [errMsg, setErrMsg] = useState(null);

  useEffect(() => {
    const st = /** @type {{ categoryUrl?: string, categoryTitle?: string } | undefined} */ (location.state);
    const fromStateUrl = typeof st?.categoryUrl === "string" ? st.categoryUrl.trim() : "";

    if (fromStateUrl !== "") {
      let dec = "";
      try {
        dec = categorySlug != null ? decodeURIComponent(categorySlug) : "";
      } catch {
        dec = categorySlug ?? "";
      }
      const t =
        typeof st?.categoryTitle === "string" && st.categoryTitle.trim() !== ""
          ? st.categoryTitle.trim()
          : titleFromDecodedSegment(dec);
      setResolvedUrl(fromStateUrl);
      setResolvedTitle(t);
      setStatus("ready");
      setErrMsg(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrMsg(null);

    apiFetch("/analytics/categories")
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.categories) ? body.categories : [];
        const row = findCategoryForSlug(list, categorySlug ?? "");
        if (!row) {
          setStatus("missing");
          setResolvedUrl("");
          setResolvedTitle("");
          return;
        }
        const key = String(row.categoryKey ?? row.categoryUrl ?? "");
        const url = String(row.categoryUrl ?? row.categoryKey ?? "").trim();
        const title = categoryDisplayLabel({
          categorySlug: row.categorySlug,
          categoryKey: key || url
        });
        setResolvedUrl(url || key);
        setResolvedTitle(title);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [categorySlug, location.state]);

  if (status === "loading" || status === "idle") {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.25rem", color: "#e7e9ea" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link to="/categorias" style={{ color: "#6ec4ff", textDecoration: "none", fontSize: "0.88rem" }}>
            ← Voltar para categorias
          </Link>
        </p>
        <p style={{ opacity: 0.85 }}>A resolver categoria…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.25rem", color: "#e7e9ea" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link to="/categorias" style={{ color: "#6ec4ff", textDecoration: "none", fontSize: "0.88rem" }}>
            ← Voltar para categorias
          </Link>
        </p>
        <p style={{ color: "#f97373" }} role="alert">
          Erro ao carregar categorias: {errMsg}
        </p>
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem 1.25rem", color: "#e7e9ea" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link to="/categorias" style={{ color: "#6ec4ff", textDecoration: "none", fontSize: "0.88rem" }}>
            ← Voltar para categorias
          </Link>
        </p>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 600 }}>Categoria não encontrada</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.82, lineHeight: 1.5 }}>
          Não encontrámos esta pasta na lista importada. Abra primeiro <Link to="/categorias">Categorias</Link> ou use o
          atalho <strong>Abrir análise</strong>.
        </p>
      </div>
    );
  }

  const pageTitle = `Analytics — ${resolvedTitle}`;

  return (
    <AnalyticsDashboardCacheProvider categoryUrl={resolvedUrl}>
      <AnalyticsDashboard variant="category" pageTitle={pageTitle} />
    </AnalyticsDashboardCacheProvider>
  );
}
