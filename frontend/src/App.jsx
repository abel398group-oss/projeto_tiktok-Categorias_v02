import { useState, useCallback } from "react";
import { apiFetch } from "./api.js";

const tabs = [
  { id: "top", label: "Top Products", path: "/analytics/top-products", key: "top" },
  { id: "opp", label: "Opportunities", path: "/analytics/opportunities", key: "opp" },
  { id: "score", label: "Product Score", path: "/analytics/product-score", key: "score" }
];

function TableTop({ data }) {
  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  const items = data?.items ?? [];
  if (data?.message && items.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (items.length === 0) return <p>Sem linhas.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>nome</th>
          <th>loja</th>
          <th>preço</th>
          <th>vendas</th>
          <th>rating</th>
          <th>link</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row, i) => (
          <tr key={`${row.productId}-${i}`}>
            <td>{row.nome}</td>
            <td>{row.loja}</td>
            <td>{row.preco ?? "—"}</td>
            <td>{row.vendas ?? "—"}</td>
            <td>{row.avaliacao ?? "—"}</td>
            <td>
              {row.link ? (
                <a href={row.link} target="_blank" rel="noopener noreferrer">
                  abrir
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableOpp({ data }) {
  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  const items = data?.items ?? [];
  if (data?.message && items.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (items.length === 0) return <p>Sem linhas.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>nome</th>
          <th>loja</th>
          <th>preço</th>
          <th>vendas</th>
          <th>rating</th>
          <th>motivo</th>
          <th>link</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row, i) => (
          <tr key={`${row.productId}-${i}`}>
            <td>{row.nome}</td>
            <td>{row.loja}</td>
            <td>{row.preco ?? "—"}</td>
            <td>{row.vendas ?? "—"}</td>
            <td>
              {row.avalMed != null ? `${row.avalMed} (${row.avalTot ?? "—"} aval)` : "—"}
            </td>
            <td>{row.motivo ?? "—"}</td>
            <td>
              {row.link ? (
                <a href={row.link} target="_blank" rel="noopener noreferrer">
                  abrir
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableScore({ data }) {
  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  const rows = data?.top ?? [];
  if (data?.message && rows.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (rows.length === 0) return <p>Sem linhas.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>score</th>
          <th>classificação</th>
          <th>nome</th>
          <th>loja</th>
          <th>preço</th>
          <th>vendas</th>
          <th>rating</th>
          <th>delta</th>
          <th>link</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.productId}-${i}`}>
            <td>{row.score}</td>
            <td>{row.classific}</td>
            <td>{row.nome}</td>
            <td>{row.loja}</td>
            <td>{row.preco ?? "—"}</td>
            <td>{row.vendas ?? "—"}</td>
            <td>{row.rating ?? "—"}</td>
            <td>{row.deltaVendas ?? "—"}</td>
            <td>
              {row.link ? (
                <a href={row.link} target="_blank" rel="noopener noreferrer">
                  abrir
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const [tab, setTab] = useState("top");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({ top: null, opp: null, score: null });

  const current = tabs.find((t) => t.id === tab);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch(current.path);
      setCache((c) => ({ ...c, [current.key]: json }));
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [current]);

  const data = current ? cache[current.key] : null;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem 1.25rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Analytics (API read-only)</h1>
      <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
        Mesmos endpoints da API Fastify. Em dev usa-se o proxy do Vite para evitar CORS.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setError(null);
            }}
            style={{
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
              borderRadius: 6,
              border: tab === t.id ? "2px solid #6ec4ff" : "1px solid #38444d",
              background: tab === t.id ? "#22303c" : "#192734",
              color: "#e7e9ea"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          style={{
            padding: "0.4rem 1rem",
            cursor: loading ? "wait" : "pointer",
            borderRadius: 6,
            border: "1px solid #38444d",
            background: "#1d9bf0",
            color: "#fff",
            fontWeight: 600
          }}
        >
          {loading ? "Carregando..." : "Carregar dados"}
        </button>
      </div>

      {data?.scrapeRun && tab !== "score" && (
        <p style={{ fontSize: "0.8rem", opacity: 0.85 }}>
          ScrapeRun: {data.scrapeRun.id}
          {" · "}
          {data.scrapeRun.collectedAt}
        </p>
      )}
      {data?.scrapeRun && tab === "score" && (
        <p style={{ fontSize: "0.8rem", opacity: 0.85 }}>
          ScrapeRun: {data.scrapeRun.id}
          {" · "}
          {data.scrapeRun.collectedAt}
          {data.previousRun ? ` · run anterior: ${data.previousRun.id}` : ""}
        </p>
      )}

      {error && (
        <p style={{ color: "#f97373", marginTop: "0.5rem" }}>
          Erro: {error}
        </p>
      )}

      {loading && <p style={{ marginTop: "0.5rem" }}>Carregando...</p>}

      {!loading && tab === "top" && <TableTop data={data} />}
      {!loading && tab === "opp" && <TableOpp data={data} />}
      {!loading && tab === "score" && <TableScore data={data} />}
    </div>
  );
}
