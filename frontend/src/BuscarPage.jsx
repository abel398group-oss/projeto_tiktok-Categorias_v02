import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "./api.js";
import { categoryDisplayLabel, categoryToPathSegment } from "./CategoriesPage.jsx";

/**
 * Busca global — uma caixa, três grupos: produtos, lojas e categorias.
 *
 * Produtos e lojas vêm do servidor (/analytics/search); as categorias são
 * filtradas aqui no cliente a partir de /analytics/categories, com a MESMA
 * lógica de slug/rótulo da página inicial — assim o link de categoria da busca
 * nunca diverge do link do cartão.
 *
 * O termo vive na URL (?q=): F5 refaz a busca, e um resultado pode ser
 * partilhado por link.
 */

const DEBOUNCE_MS = 250;

/** Sem acentos e minúsculas: "calca" tem de achar "Calça". */
function chave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function formatarPreco(n) {
  return typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

export default function BuscarPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState(params.get("q") ?? "");
  const [resultado, setResultado] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const timerRef = useRef(null);

  // Categorias uma vez só: a lista é pequena e já existe como endpoint.
  useEffect(() => {
    let ativo = true;
    apiFetch("/analytics/categories")
      .then((body) => {
        if (ativo) setCategorias(Array.isArray(body?.categories) ? body.categories : []);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  // Busca com debounce; o termo espelha-se na URL para F5/partilha funcionarem.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = termo.trim();
    setParams(q ? { q } : {}, { replace: true });

    if (q.length < 2) {
      setResultado(null);
      setErro("");
      return undefined;
    }
    timerRef.current = setTimeout(() => {
      setBuscando(true);
      setErro("");
      apiFetch(`/analytics/search?q=${encodeURIComponent(q)}`)
        .then((body) => setResultado(body))
        .catch((e) => setErro(e?.message ? String(e.message) : "A busca falhou."))
        .finally(() => setBuscando(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  const categoriasFiltradas = useMemo(() => {
    const q = chave(termo.trim());
    if (q.length < 2) return [];
    return categorias
      .filter((row) => {
        const rotulo = categoryDisplayLabel({
          categorySlug: row.categorySlug,
          categoryKey: String(row.categoryKey ?? row.categoryUrl ?? "")
        });
        return chave(rotulo).includes(q) || chave(row.categorySlug ?? "").includes(q);
      })
      .slice(0, 8);
  }, [categorias, termo]);

  const produtos = resultado?.produtos ?? [];
  const lojas = resultado?.lojas ?? [];
  const nada =
    !buscando && termo.trim().length >= 2 && produtos.length === 0 && lojas.length === 0 &&
    categoriasFiltradas.length === 0;

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
        <h1>Buscar</h1>
        <p style={{ opacity: 0.8, marginTop: "0.25rem", fontSize: "0.85rem" }}>
          Produto pelo nome, loja pelo nome, categoria pelo rótulo — ou cole um ID de produto.
        </p>

        <input
          type="search"
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Ex.: body feminino, Elden, calçados…"
          aria-label="Termo de busca"
          style={{
            width: "100%",
            maxWidth: "34rem",
            margin: "0.9rem 0 1.1rem",
            padding: "0.55rem 0.8rem",
            fontSize: "0.95rem",
            borderRadius: 8,
            border: "1px solid var(--tk-border)",
            background: "var(--tk-bg-elev, transparent)",
            color: "inherit"
          }}
        />

        {erro ? (
          <p role="alert" style={{ color: "var(--tk-danger, #f85149)" }}>{erro}</p>
        ) : null}
        {buscando ? <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>A buscar…</p> : null}
        {nada ? (
          <p style={{ opacity: 0.85 }}>
            Nada com «{termo.trim()}». A busca cobre o que já está na base — se o produto é
            novo no TikTok, colete a categoria dele primeiro.
          </p>
        ) : null}

        {produtos.length > 0 ? (
          <section aria-label="Produtos encontrados" style={{ marginBottom: "1.4rem" }}>
            <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
              Produtos <span style={{ opacity: 0.6, fontWeight: 400 }}>({produtos.length})</span>
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table className="tk-analytics-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <tbody>
                  {produtos.map((p) => (
                    <tr
                      key={p.productId}
                      className="clicavel"
                      style={{ borderBottom: "1px solid var(--tk-border)", cursor: "pointer" }}
                      onClick={() => navigate(`/produto/${encodeURIComponent(p.productId)}`)}
                    >
                      <td style={{ padding: "0.4rem 0.45rem", maxWidth: "26rem" }}>{p.nome}</td>
                      <td style={{ padding: "0.4rem 0.45rem", opacity: 0.8 }}>{p.loja}</td>
                      <td style={{ padding: "0.4rem 0.45rem", whiteSpace: "nowrap" }}>{formatarPreco(p.preco)}</td>
                      <td style={{ padding: "0.4rem 0.45rem", whiteSpace: "nowrap" }}>
                        {typeof p.vendas === "number" ? `${p.vendas.toLocaleString("pt-BR")} vendas` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {categoriasFiltradas.length > 0 ? (
          <section aria-label="Categorias encontradas" style={{ marginBottom: "1.4rem" }}>
            <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
              Categorias <span style={{ opacity: 0.6, fontWeight: 400 }}>({categoriasFiltradas.length})</span>
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.9 }}>
              {categoriasFiltradas.map((row) => {
                const key = String(row.categoryKey ?? row.categoryUrl ?? "");
                const segment = categoryToPathSegment({ categorySlug: row.categorySlug, categoryKey: key });
                return (
                  <li key={key}>
                    <Link to={`/categoria/${encodeURIComponent(segment)}`} className="tk-nav-link">
                      {categoryDisplayLabel({ categorySlug: row.categorySlug, categoryKey: key })}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {lojas.length > 0 ? (
          <section aria-label="Lojas encontradas">
            <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
              Lojas <span style={{ opacity: 0.6, fontWeight: 400 }}>({lojas.length})</span>
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.9 }}>
              {lojas.map((l) => (
                <li key={l.sellerId}>
                  {l.nome}{" "}
                  <span style={{ opacity: 0.65, fontSize: "0.8rem" }}>
                    · {l.produtosNaBase} produto(s) na base
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
