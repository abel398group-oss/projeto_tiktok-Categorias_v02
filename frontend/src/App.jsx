import { useState, useCallback, useMemo } from "react";
import { apiFetch } from "./api.js";
import {
  sortMapSubcatsByColumn,
  sortMapTopProductsByColumn,
  sortOppItemsByColumn,
  sortScalableRowsByColumn,
  sortScoreRowsByColumn,
  sortTopItemsByColumn
} from "./sortUtils.js";

const tabs = [
  { id: "top", label: "Top Products", path: "/analytics/top-products", key: "top" },
  { id: "opp", label: "Opportunities", path: "/analytics/opportunities", key: "opp" },
  { id: "score", label: "Product Score", path: "/analytics/product-score", key: "score" },
  { id: "scale", label: "🔥 Escalar", path: "/analytics/scalable-products", key: "scale" },
  { id: "map", label: "🧭 Mapa", path: "/analytics/category-map", key: "map" }
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

/** Caixa introdutória (mesmo padrão visual da aba Escalar). */
function IntroCard({ title, children }) {
  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: 10,
        border: "1px solid #38444d",
        background: "#15202b"
      }}
    >
      <h2 style={{ fontSize: "0.98rem", fontWeight: 600, margin: "0 0 0.5rem 0" }}>{title}</h2>
      <div style={{ fontSize: "0.8rem", opacity: 0.9, lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

/**
 * Ao mudar de coluna: primeiro clique usa desc para métricas onde "maior = mais relevante"
 * (lista por tabela). Nome/loja/motivo/colunas de texto ficam asc (A→Z).
 */
function toggleSort(prevKey, prevDir, newKey, descPreferredKeys = ["score"]) {
  if (newKey === prevKey) {
    return { key: prevKey, dir: prevDir === "asc" ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc") };
  }
  const dir = descPreferredKeys.includes(newKey) ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc");
  return { key: newKey, dir };
}

const SORT_TOP_DESC = ["vendas", "preco", "rating"];
const SORT_OPP_DESC = ["avalMed", "vendas", "preco"];
const SORT_SCORE_DESC = ["score", "preco", "vendas", "delta", "rating"];
const SORT_SCALE_DESC = ["score", "vendas", "rating"];
/** Subcategoria: primeiro clique em métricas = maior→menor. */
const SORT_MAP_SUB_DESC = ["score", "totalSales", "avgRating", "avgPrice", "totalProducts", "opportunities"];
const SORT_MAP_TOP_DESC = ["score", "vendas", "rating", "preco", "delta"];

/** Aceita só arrays; evita crash se a API devolver object ou outro tipo onde esperamos lista. */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function TableTop({ data }) {
  const rawItems = asArray(data?.items);
  /** Alinhado ao relatório Top: primeiro por vendas, maior→menor. */
  const [sort, setSort] = useState(() => ({ key: "vendas", dir: /** @type {SortDir} */ ("desc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortTopItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_TOP_DESC));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;

  const topIntro = (
    <IntroCard title='O que é "Top Products"?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Lista os SKU com maior <strong>volume de vendas declarado</strong> na <strong>última coleta importada</strong>. O
        servidor devolve até <strong>20</strong> linhas ordenadas por <strong>vendas (desc.)</strong>; na tabela podes{" "}
        <strong>reordenar por outra coluna</strong> (preço, nome, etc.) só para leitura no ecrã.
      </p>
      <p style={{ margin: 0 }}>
        Mostra nome, loja, preço, vendas e rating desse snapshot — ranking factual da base, não previsão comercial.
      </p>
    </IntroCard>
  );

  if (data?.message && rawItems.length === 0) {
    return (
      <>
        {topIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }
  if (rawItems.length === 0) {
    return (
      <>
        {topIntro}
        <p>Sem linhas.</p>
      </>
    );
  }
  return (
    <>
      {topIntro}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> vendas do <strong>maior para o menor</strong> (como na API). Altere clicando nos
        cabeçalhos — não ordenamos <strong>link</strong>.
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
  const rawItems = asArray(data?.items);
  /** Oportunidades: métrica forte = média alta; servidor usa média desc. */
  const [sort, setSort] = useState(() => ({ key: "avalMed", dir: /** @type {SortDir} */ ("desc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortOppItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_OPP_DESC));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;

  const oppIntro = (
    <IntroCard title='O que é "Opportunities" (oportunidades)?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Filtra no <strong>último run</strong> uma lista <strong>exploratória</strong> (até <strong>20</strong> linhas):
        <strong> média de avaliação ≥ 4,5</strong>, <strong>pelo menos 5 avaliações</strong>, vendas entre{" "}
        <strong>10 e 300</strong> e preço preenchido — heurística <strong>v1</strong> no código.
      </p>
      <p style={{ margin: 0 }}>
        Serve para achar SKUs com boa percepção mas ainda sem volumes enormes: <strong>não substitui score oficial nem
        garantia de margem</strong>; o campo motivo lembra apenas a regra.
      </p>
    </IntroCard>
  );

  if (data?.message && rawItems.length === 0) {
    return (
      <>
        {oppIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }
  if (rawItems.length === 0) {
    return (
      <>
        {oppIntro}
        <p>Sem linhas.</p>
      </>
    );
  }
  return (
    <>
      {oppIntro}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> média de avaliação do <strong>maior para o menor</strong> (critério principal aqui).
        Altere clicando nos cabeçalhos — não ordenamos <strong>link</strong>.
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
  const rawRows = asArray(data?.top);
  const [sort, setSort] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const rows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return sortScoreRowsByColumn(rawRows, sort.key, sort.dir);
  }, [rawRows, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_SCORE_DESC));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;

  const scoreIntro = (
    <IntroCard title='O que é "Product Score" (score do produto)?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Combina vários blocos dos snapshots do <strong>último run</strong> — vendas, avaliações, preço válido,
        eventual desconto, faixa &quot;oportunidade&quot; e, quando há <strong>dois runs comparáveis</strong>, também a{" "}
        <strong>variação de vendas</strong> versus o run anterior — numa pontuação <strong>única entre 0 e 100</strong> só
        em memória.
      </p>
      <p style={{ margin: 0 }}>
        A lista mostra até os <strong>30</strong> melhores valores de score (por defeito do servidor ordenado por pontos
        desc.). As etiquetas (excelente, bom…) são faixas de leitura; <strong>não substitui</strong> modelo de ML nem promessa
        de revenue — ver <code style={{ opacity: 0.85 }}>docs/ANALYTICS.md</code> nos detalhes dos pesos.
      </p>
    </IntroCard>
  );

  if (data?.message && rawRows.length === 0) {
    return (
      <>
        {scoreIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }
  if (rawRows.length === 0) {
    return (
      <>
        {scoreIntro}
        <p>Sem linhas.</p>
      </>
    );
  }
  return (
    <>
      {scoreIntro}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong> (▼ em <strong>score</strong>).
        Métricas numéricas fazem primeiro clique maior→menor; nome e loja A→Z.
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

function TableCategoryMap({ data }) {
  const masters = asArray(data?.masterCategories);

  /** @type {{
   * masterName: string,
   * subName: string,
   * classification: string,
   * score: number,
   * totalProducts: number,
   * totalSales: number,
   * avgRating: number,
   * avgPrice: number,
   * opportunities: number,
   * _key: string
   * }[]} */
  const flatSubcats = useMemo(() => {
    const rows = [];
    for (const m of masters) {
      for (const sub of asArray(m.subcategories)) {
        rows.push({
          masterName: m.name ?? "—",
          subName: sub.name ?? "—",
          classification: sub.classification ?? "",
          score: sub.score ?? 0,
          totalProducts: sub.totalProducts ?? 0,
          totalSales: sub.totalSales ?? 0,
          avgRating: sub.avgRating ?? 0,
          avgPrice: sub.avgPrice ?? 0,
          opportunities: sub.opportunities ?? 0,
          _key: `${m.name ?? ""}::${sub.name ?? ""}`
        });
      }
    }
    return rows;
  }, [masters]);

  /** Linhas Topo por sub (combinado para uma tabela, estilo relatórios). */
  /** @type {{
   * masterName: string,
   * subName: string,
   * nome: string,
   * score: number,
   * vendas: number,
   * rating: number | null | undefined,
   * preco: number | null | undefined,
   * delta: number | null | undefined,
   * link: string,
   * rowKey: string,
   * productId?: string }[]} */
  const flatTops = useMemo(() => {
    const rows = [];
    for (const m of masters) {
      for (const sub of asArray(m.subcategories)) {
        for (const p of asArray(sub.topProducts)) {
          rows.push({
            masterName: m.name ?? "—",
            subName: sub.name ?? "—",
            nome: p.nome ?? "—",
            productId: p.productId ?? "",
            score: p.score ?? 0,
            vendas: typeof p.vendas === "number" ? p.vendas : Number(p.vendas) || 0,
            rating: p.rating ?? null,
            preco: p["preço"] != null ? p["preço"] : p.preco,
            delta: p.delta != null ? p.delta : null,
            link: p.link ?? "",
            rowKey: `${m.name ?? ""}::${sub.name ?? ""}::${p.productId ?? p.nome ?? ""}`
          });
        }
      }
    }
    return rows;
  }, [masters]);

  const [sortSub, setSortSub] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));
  const [sortTop, setSortTop] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const sortedSubcats = useMemo(() => {
    if (flatSubcats.length === 0) return [];
    return sortMapSubcatsByColumn(flatSubcats, sortSub.key, sortSub.dir);
  }, [flatSubcats, sortSub]);

  const sortedTops = useMemo(() => {
    if (flatTops.length === 0) return [];
    return sortMapTopProductsByColumn(flatTops, sortTop.key, sortTop.dir);
  }, [flatTops, sortTop]);

  const onSortSub = useCallback((k) => {
    setSortSub((s) => toggleSort(s.key, s.dir, k, SORT_MAP_SUB_DESC));
  }, []);

  const onSortTop = useCallback((k) => {
    setSortTop((s) => toggleSort(s.key, s.dir, k, SORT_MAP_TOP_DESC));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;

  const mapIntro = (
    <IntroCard title='O que é o "Mapa de categoria"?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Agrupa todos os snapshots do <strong>último ScrapeRun</strong> segundo o texto em{" "}
        <strong>categoryUrl</strong> — em geral <strong>mestre / subcategoria</strong> quando o breadcrumb existe.
      </p>
      <p style={{ margin: 0 }}>
        As métricas por sub são agregações simples sobre os produtos dessa pasta; o <strong>score da subcategoria</strong> é
        a média das pontuações do Product Score (<strong>só em memória</strong>). Os blocos seguintes repetem o padrão
        das outras abas: texto de ordem + tabela com cabeçalhos clicáveis.
      </p>
    </IntroCard>
  );

  if (data?.message && masters.length === 0) {
    return (
      <>
        {mapIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }

  if (masters.length === 0) {
    return (
      <>
        {mapIntro}
        <p>Sem dados agregados.</p>
      </>
    );
  }

  const tdStyle = {
    padding: "0.4rem 0.45rem",
    borderBottom: "1px solid #2f3f4a",
    fontSize: "0.875rem",
    verticalAlign: "top"
  };

  return (
    <>
      {mapIntro}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial (subcategorias):</strong> <strong>score</strong> médio da sub da maior para a menor.
        Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>sub</strong> e{" "}
        <strong>classificação</strong> em A→Z.{" "}
        {data.scoreMethod ? <span style={{ opacity: 0.88 }}>{data.scoreMethod}</span> : null}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.35rem" }}>
        <thead>
          <tr>
            <SortTh label="categoria mestre" colKey="masterName" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="subcategoria" colKey="subName" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="score" colKey="score" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="classificação" colKey="classification" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="produtos" colKey="totalProducts" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="vendas (Σ)" colKey="totalSales" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="rating méd." colKey="avgRating" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="preço méd." colKey="avgPrice" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
            <SortTh label="oport." colKey="opportunities" sortKey={sortSub.key} sortDir={sortSub.dir} onSort={onSortSub} />
          </tr>
        </thead>
        <tbody>
          {sortedSubcats.map((row) => (
            <tr key={row._key}>
              <td style={tdStyle}>{row.masterName}</td>
              <td style={tdStyle}>{row.subName}</td>
              <td style={tdStyle}>{row.score}</td>
              <td style={tdStyle}>{row.classification}</td>
              <td style={tdStyle}>{row.totalProducts}</td>
              <td style={tdStyle}>{row.totalSales}</td>
              <td style={tdStyle}>{row.avgRating}</td>
              <td style={tdStyle}>{row.avgPrice}</td>
              <td style={tdStyle}>{row.opportunities}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "#eaf2f9" }}>
        SKU em destaque (top por score em cada subcategoria)
      </h3>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor nesta listagem combinada.
        Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>sub</strong> e{" "}
        <strong>nome</strong> em A→Z. O link não é ordenável.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <SortTh label="mestre" colKey="masterName" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="sub" colKey="subName" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="nome" colKey="nome" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="score" colKey="score" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="vendas" colKey="vendas" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="rating" colKey="rating" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="preço" colKey="preco" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <SortTh label="Δ vendas" colKey="delta" sortKey={sortTop.key} sortDir={sortTop.dir} onSort={onSortTop} />
            <PlainTh label="link" />
          </tr>
        </thead>
        <tbody>
          {sortedTops.map((row, i) => (
            <tr key={row.rowKey || i}>
              <td style={tdStyle}>{row.masterName}</td>
              <td style={tdStyle}>{row.subName}</td>
              <td style={tdStyle}>{row.nome}</td>
              <td style={tdStyle}>{row.score}</td>
              <td style={tdStyle}>{row.vendas ?? "—"}</td>
              <td style={tdStyle}>{row.rating != null ? row.rating : "—"}</td>
              <td style={tdStyle}>{row.preco != null ? row.preco : "—"}</td>
              <td style={tdStyle}>{row.delta != null ? row.delta : "—"}</td>
              <td style={tdStyle}>
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
  const rawV = asArray(data?.validatedToScale);
  const rawP = asArray(data?.potentialBets);

  const [scaleView, setScaleView] = useState(/** @type {'validated' | 'potential'} */ ("validated"));

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
    setSortVal((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC));
  }, []);

  const onSortP = useCallback((k) => {
    setSortPot((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC));
  }, []);

  if (data == null) return <p style={{ opacity: 0.75 }}>Carregue os dados com o botão acima.</p>;
  if (data?.message && !data?.scrapeRun) {
    return <p style={{ opacity: 0.85 }}>{data.message}</p>;
  }

  const pill = (active) => ({
    padding: "0.4rem 0.95rem",
    cursor: "pointer",
    borderRadius: 8,
    border: active ? "2px solid #6ec4ff" : "1px solid #38444d",
    background: active ? "#22303c" : "#16212b",
    color: "#e7e9ea",
    fontWeight: active ? 600 : 400,
    fontSize: "0.85rem"
  });

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
      <IntroCard title='O que é "Escalar" neste painel?'>
        <p style={{ margin: 0 }}>
          <strong>Escalar</strong> significa aumentar esforço comercial num SKU do TikTok Shop — por exemplo criativos/paid,
          reposição ou repetir formato — com base na <strong>última coleta</strong>. As duas listas abaixo partem do mesmo{" "}
          <strong>top do score analítico</strong> (até 30 produtos), mas <strong>cortam grupos diferentes</strong>: quem já
          mostrou tração consistente versus quem ainda está numa faixa mais cedo mas com bons sinais.
        </p>
      </IntroCard>

      <p style={{ fontSize: "0.72rem", opacity: 0.65, marginBottom: "0.65rem" }}>
        Clique num separador para ver só uma lista. Cada lista ordena de forma independente (cabeçalhos clicáveis, excepto{" "}
        <strong>link</strong>).{" "}
        <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor — para <strong>vendas</strong> e{" "}
        <strong>rating</strong>, o primeiro clique também é maior→menor; <strong>nome</strong> fica A→Z.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" style={pill(scaleView === "validated")} onClick={() => setScaleView("validated")}>
          1 · Validados para escalar ({rawV.length})
        </button>
        <button type="button" style={pill(scaleView === "potential")} onClick={() => setScaleView("potential")}>
          2 · Apostas com potencial ({rawP.length})
        </button>
      </div>

      {scaleView === "validated" && (
        <section style={{ padding: "0 0 1rem 0" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "#eaf2f9" }}>
            Validados para escalar — escalar quê?
          </h3>
          <p style={{ fontSize: "0.8rem", opacity: 0.88, margin: "0 0 1rem 0", lineHeight: 1.55, maxWidth: "58rem" }}>
            Aqui tratamos de produtos já com <strong>volume de vendas demonstrado no feed</strong>{" "}
            (<strong>300 a 3&nbsp;000</strong> unidades no snapshot), <strong>avaliação média ≥ 4,3</strong>,{" "}
            <strong>score ≥ 55</strong> e <strong>preço válido</strong>. A ideia de &quot;escalar&quot; é aumentar canal,
            margem ou repetição de campanhas <strong>com menos incerteza</strong> do que um artigo novo: são os primeiros candidatos se
            quiseres intensificar peso do catálogo.
          </p>
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
        </section>
      )}

      {scaleView === "potential" && (
        <section style={{ padding: "0 0 1rem 0" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "#eaf2f9" }}>
            Apostas com potencial — apostar em quê?
          </h3>
          <p style={{ fontSize: "0.8rem", opacity: 0.88, margin: "0 0 1rem 0", lineHeight: 1.55, maxWidth: "58rem" }}>
            Neste bloco, <strong>&quot;escalar&quot; é gradual</strong>: são SKUs com{" "}
            <strong>vendas ainda típicas de arranque</strong> (<strong>10 a 300</strong>), mas com{" "}
            <strong>rating alto</strong> (média <strong>≥ 4,5</strong>, pelo menos <strong>5 avaliações</strong>) e{" "}
            <strong>score ≥ 45</strong>. Servem como <strong>banco de apostas</strong>: testar creatives e stock antes do
            nível dos validados — o rótulo diz respeito a <strong>crescimento eventual</strong>, não a garantia métrica.
          </p>
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
        </section>
      )}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("top");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({ top: null, opp: null, score: null, scale: null, map: null });

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

      {data?.scrapeRun && (
        <p style={{ fontSize: "0.8rem", opacity: 0.85 }}>
          ScrapeRun: {data.scrapeRun.id}
          {" · "}
          {data.scrapeRun.collectedAt}
          {["score", "scale", "map"].includes(tab) && data.previousRun
            ? ` · run anterior: ${data.previousRun.id}`
            : ""}
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
      {!loading && tab === "map" && <TableCategoryMap data={data} />}
    </div>
  );
}
