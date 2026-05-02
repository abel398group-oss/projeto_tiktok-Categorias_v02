import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiFetch } from "./api.js";
import { AnalyticsDashboardCacheProvider } from "./analyticsDashboardCache.jsx";
import { AnalyticsDashboard } from "./App.jsx";
import { categoryDisplayLabel, categoryToPathSegment } from "./CategoriesPage.jsx";
import { parseCategoryBreadForHeader } from "./mapCategoryUi.js";

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

/** @param {string} seg */
function humanizeHyphenSlug(seg) {
  return String(seg)
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function shell(children) {
  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        {children}
      </div>
    </main>
  );
}

/**
 * Mesma API de relatórios que `/analytics`, mas com `categoryUrl` no provider (snapshot por categoria).
 */
export default function CategoryAnalyticsPage() {
  const { categorySlug } = useParams();
  const location = useLocation();
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'missing' | 'ready' | 'error'} */ ("idle"));
  const [errMsg, setErrMsg] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [resolvedTitle, setResolvedTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    const st = /** @type {Record<string, unknown> | undefined} */ (location.state);
    const fromStateUrl = st?.categoryUrl != null ? String(st.categoryUrl).trim() : "";
    const fromStateTitle = st?.categoryTitle != null ? String(st.categoryTitle).trim() : "";

    if (fromStateUrl !== "") {
      let dec = "";
      try {
        dec = categorySlug != null ? decodeURIComponent(categorySlug) : "";
      } catch {
        dec = categorySlug ?? "";
      }
      setResolvedUrl(fromStateUrl);
      setResolvedTitle(fromStateTitle !== "" ? fromStateTitle : titleFromDecodedSegment(dec));
      setStatus("ready");
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    setErrMsg("");
    apiFetch("/analytics/categories")
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.categories) ? body.categories : [];
        const row = findCategoryForSlug(list, categorySlug ?? "");
        if (!row) {
          setStatus("missing");
          return;
        }
        const key = String(row.categoryKey ?? row.categoryUrl ?? "");
        setResolvedUrl(String(row.categoryUrl ?? row.categoryKey ?? key));
        setResolvedTitle(
          categoryDisplayLabel({
            categorySlug: row.categorySlug,
            categoryKey: key
          })
        );
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
    return shell(
      <>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link
            to="/"
            style={{ color: "var(--tk-accent)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 }}
          >
            ← Voltar ao início
          </Link>
        </p>
        <p style={{ opacity: 0.85 }}>A resolver categoria…</p>
      </>
    );
  }

  if (status === "error") {
    return shell(
      <>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link
            to="/"
            style={{ color: "var(--tk-accent)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 }}
          >
            ← Voltar ao início
          </Link>
        </p>
        <p style={{ color: "var(--tk-danger)" }} role="alert">
          Erro ao carregar categorias: {errMsg}
        </p>
      </>
    );
  }

  if (status === "missing") {
    return shell(
      <>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link
            to="/"
            style={{ color: "var(--tk-accent)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 }}
          >
            ← Voltar ao início
          </Link>
        </p>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 600 }}>Categoria não encontrada</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.82, lineHeight: 1.5, maxWidth: "42rem" }}>
          Não encontrámos esta pasta na lista importada. Abra primeiro a <Link to="/">lista de categorias</Link> ou use o
          atalho <strong>Abrir análise</strong>.
        </p>
      </>
    );
  }

  const bread = parseCategoryBreadForHeader(resolvedUrl);

  const pageTitle = `Analytics — ${resolvedTitle}`;

  return (
    <AnalyticsDashboardCacheProvider categoryUrl={resolvedUrl}>
      <AnalyticsDashboard variant="category" pageTitle={pageTitle} categoryBread={bread} />
    </AnalyticsDashboardCacheProvider>
  );
}
