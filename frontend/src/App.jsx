import { useState, useCallback, useMemo } from "react";
import { apiFetch } from "./api.js";
import {
  sortOppItemsByColumn,
  sortScalableRowsByColumn,
  sortScoreRowsByColumn,
  sortTopItemsByColumn
} from "./sortUtils.js";

const tabs = [
  { id: "top", label: "Top Products", path: "/analytics/top-products", key: "top" },
  { id: "opp", label: "Opportunities", path: "/analytics/opportunities", key: "opp" },
  { id: "score", label: "Product Score", path: "/analytics/product-score", key: "score" },
  { id: "scale", label: "🔥 Escalar", path: "/analytics/scalable-products", key: "scale" }
];

/** @typedef {'asc' | 'desc'} SortDir */

/**
 * Cabeçalho ordenável (▲▼ quando activo, ↕ quando inactivo).
 * @param {{ label: string, colKey: string, sortKey: string, sortDir: SortDir, onSort: (k: string) => void }} props
 */
function SortTh({ label, colKey, sortKey, sortDir, onSort }) {
  const active = sortKey === colKey;
  return (
    <th
      scope="col"
      role="columnheader"
      tabIndex={0}
      title="Ordenar por esta coluna"
      style={{
        cursor: "pointer",
        userSelect: "none",
        borderBottom: active ? "2px solid #6ec4ff" : undefined,
        verticalAlign: "middle",
        padding: "0.4rem 0.5rem",
        boxSizing: "border-box"
      }}
      onClick={() => onSort(colKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(colKey);
        }
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          width: "100%",
          minWidth: "4.5rem"
        }}
      >
        <span style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: 0 }}>
          {label}
        </span>
        <span
          style={{
            flex: "0 0 auto",
            opacity: active ? 1 : 0.42,
            lineHeight: 1,
            fontSize: "0.72rem"
          }}
          aria-hidden="true"
        >
          {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u2195"}
        </span>
      </div>
    </th>
  );
}

/** Cabeçalho não ordenável (ex.: link). */
function PlainTh({ label }) {
  return (
    <th scope="col" role="columnheader" style={{ padding: "0.4rem 0.5rem", verticalAlign: "middle" }}>
      {label}
    </th>
  );
}

/** Primeira ordenação ao mudar de coluna: score tende a desc; resto asc. */
function toggleSort(prevKey, prevDir, newKey, scoreLikeKeys = ["score"]) {
  if (newKey === prevKey) {
    return { key: prevKey, dir: prevDir === "asc" ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc") };
  }
  const dir = scoreLikeKeys.includes(newKey) ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc");
  return { key: newKey, dir };
}

function TableTop({ data }) {
  const rawItems = data?.items ?? [];
  const [sort, setSort] = useState(() => ({ key: "preco", dir: /** @type {SortDir} */ ("asc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortTopItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, []));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  if (data?.message && rawItems.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (rawItems.length === 0) return <p>Sem linhas.</p>;
  return (
    <>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        Clique nos cabeçalhos para ordenar (menos <strong>link</strong>).
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <SortTh label="nome" colKey="nome" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="loja" colKey="loja" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="preço" colKey="preco" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="vendas" colKey="vendas" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="rating" colKey="rating" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <PlainTh label="link" />
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
    </>
  );
}

function TableOpp({ data }) {
  const rawItems = data?.items ?? [];
  const [sort, setSort] = useState(() => ({ key: "avalMed", dir: /** @type {SortDir} */ ("asc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortOppItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, []));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  if (data?.message && rawItems.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (rawItems.length === 0) return <p>Sem linhas.</p>;
  return (
    <>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        Clique nos cabeçalhos para ordenar (menos <strong>link</strong>).
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <SortTh label="nome" colKey="nome" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="loja" colKey="loja" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="preço" colKey="preco" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="vendas" colKey="vendas" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="rating" colKey="avalMed" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="motivo" colKey="motivo" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <PlainTh label="link" />
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
    </>
  );
}

function TableScore({ data }) {
  const rawRows = data?.top ?? [];
  const [sort, setSort] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const rows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return sortScoreRowsByColumn(rawRows, sort.key, sort.dir);
  }, [rawRows, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, ["score"]));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  if (data?.message && rawRows.length === 0) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }
  if (rawRows.length === 0) return <p>Sem linhas.</p>;
  return (
    <>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        Clique nos cabeçalhos para ordenar (menos <strong>link</strong>).
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <SortTh label="score" colKey="score" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="classificação" colKey="classific" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="nome" colKey="nome" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="loja" colKey="loja" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="preço" colKey="preco" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="vendas" colKey="vendas" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="rating" colKey="rating" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <SortTh label="delta" colKey="delta" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} />
            <PlainTh label="link" />
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
    </>
  );
}

function TableScalableSections({ data }) {
  const rawV = data?.validatedToScale ?? [];
  const rawP = data?.potentialBets ?? [];

  const [sortVal, setSortVal] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));
  const [sortPot, setSortPot] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const v = useMemo(() => {
    if (rawV.length === 0) return [];
    return sortScalableRowsByColumn(rawV, sortVal.key, sortVal.dir);
  }, [rawV, sortVal]);

  const p = useMemo(() => {
    if (rawP.length === 0) return [];
    return sortScalableRowsByColumn(rawP, sortPot.key, sortPot.dir);
  }, [rawP, sortPot]);

  const onSortV = useCallback((k) => {
    setSortVal((s) => toggleSort(s.key, s.dir, k, ["score"]));
  }, []);

  const onSortP = useCallback((k) => {
    setSortPot((s) => toggleSort(s.key, s.dir, k, ["score"]));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  if (data?.message && !data?.scrapeRun) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }

  const renderRows = (list) =>
    list.map((row, i) => (
      <tr key={`${row.productId}-${i}`}>
        <td>{row.nome}</td>
        <td>{row.score}</td>
        <td>{row.vendas ?? "—"}</td>
        <td>{row.rating ?? "—"}</td>
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
    ));

  return (
    <>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        Cada tabela ordena de forma independente; clique nos cabeçalhos (menos <strong>link</strong>).
      </p>
      <h2 style={{ fontSize: "1rem", marginTop: "1rem", marginBottom: "0.5rem" }}>1) Validados para escalar</h2>
      {rawV.length === 0 ? (
        <p style={{ opacity: 0.85 }}>Nenhum produto deste top satisfaz as regras de &quot;validados&quot;.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <SortTh label="nome" colKey="nome" sortKey={sortVal.key} sortDir={sortVal.dir} onSort={onSortV} />
              <SortTh label="score" colKey="score" sortKey={sortVal.key} sortDir={sortVal.dir} onSort={onSortV} />
              <SortTh label="vendas" colKey="vendas" sortKey={sortVal.key} sortDir={sortVal.dir} onSort={onSortV} />
              <SortTh label="rating" colKey="rating" sortKey={sortVal.key} sortDir={sortVal.dir} onSort={onSortV} />
              <PlainTh label="link" />
            </tr>
          </thead>
          <tbody>{renderRows(v)}</tbody>
        </table>
      )}

      <h2 style={{ fontSize: "1rem", marginTop: "1.25rem", marginBottom: "0.5rem" }}>2) Apostas com potencial</h2>
      {rawP.length === 0 ? (
        <p style={{ opacity: 0.85 }}>Nenhum produto deste top satisfaz as regras de &quot;apostas&quot;.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <SortTh label="nome" colKey="nome" sortKey={sortPot.key} sortDir={sortPot.dir} onSort={onSortP} />
              <SortTh label="score" colKey="score" sortKey={sortPot.key} sortDir={sortPot.dir} onSort={onSortP} />
              <SortTh label="vendas" colKey="vendas" sortKey={sortPot.key} sortDir={sortPot.dir} onSort={onSortP} />
              <SortTh label="rating" colKey="rating" sortKey={sortPot.key} sortDir={sortPot.dir} onSort={onSortP} />
              <PlainTh label="link" />
            </tr>
          </thead>
          <tbody>{renderRows(p)}</tbody>
        </table>
      )}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("top");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({ top: null, opp: null, score: null, scale: null });

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

      {data?.scrapeRun && tab !== "score" && tab !== "scale" && (
        <p style={{ fontSize: "0.8rem", opacity: 0.85 }}>
          ScrapeRun: {data.scrapeRun.id}
          {" · "}
          {data.scrapeRun.collectedAt}
        </p>
      )}
      {data?.scrapeRun && (tab === "score" || tab === "scale") && (
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
      {!loading && tab === "scale" && <TableScalableSections data={data} />}
    </div>
  );
}
