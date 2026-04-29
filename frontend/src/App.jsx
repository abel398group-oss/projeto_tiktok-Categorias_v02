import { useState, useCallback, useMemo } from "react";
import { apiFetch } from "./api.js";
import { mapCategoryTableLabels } from "./mapCategoryUi.js";
import { ColumnResizeGrip, useColumnWidths } from "./useColumnWidths.jsx";
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
function SortTh({ label, colKey, sortKey, sortDir, onSort, resizeColIdx, onGrip }) {
  const active = sortKey === colKey;
  const resize = resizeColIdx != null && onGrip;
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
        paddingRight: resize ? "0.65rem" : "0.5rem",
        boxSizing: "border-box",
        position: resize ? "relative" : undefined,
        overflow: "hidden"
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
      {resize ? <ColumnResizeGrip onMouseDown={onGrip(resizeColIdx)} /> : null}
    </th>
  );
}

/** Cabeçalho não ordenável (ex.: link ou # posição). */
function PlainTh({ label, title, resizeColIdx, onGrip }) {
  const resize = resizeColIdx != null && onGrip;
  return (
    <th
      scope="col"
      role="columnheader"
      title={title}
      style={{
        padding: "0.4rem 0.5rem",
        paddingRight: resize ? "0.65rem" : "0.5rem",
        verticalAlign: "middle",
        position: resize ? "relative" : undefined,
        overflow: "hidden"
      }}
    >
      {label}
      {resize ? <ColumnResizeGrip onMouseDown={onGrip(resizeColIdx)} /> : null}
    </th>
  );
}

/** Linha inicial: número 1-based na ordenação atual. */
const tdPosStyle = {
  textAlign: "right",
  padding: "0.35rem 0.65rem",
  width: "2.65rem",
  fontVariantNumeric: "tabular-nums",
  opacity: 0.9
};
const positionThTitle = "Posição na ordenação atual (1, 2, 3…)";
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

/** Larguras iniciais (px): mesma ordem que `<colgroup>` por tabela — redimensionável no cabeçalho */
const CW_TOP = [52, 210, 150, 80, 90, 100, 76];
const CW_OPP = [52, 200, 150, 80, 90, 100, 148, 76];
const CW_SCORE = [52, 64, 120, 200, 150, 80, 90, 100, 80, 76];
const CW_MAP_SUB = [52, 120, 200, 64, 120, 80, 90, 80, 80, 76];
const CW_MAP_TOP = [52, 120, 200, 200, 64, 90, 80, 80, 76, 76];
const CW_SCALE = [52, 220, 64, 90, 100, 76];

/** Aceita só arrays; evita crash se a API devolver object ou outro tipo onde esperamos lista. */
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function TableTop({ data }) {
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_TOP);

  const topIntro = (
    <IntroCard title='O que é "Top Products"?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Esta lista mostra os <strong>produtos (SKU) com mais vendas anunciadas</strong> segundo os dados da{" "}
        <strong>última vez que importaste a coleta</strong> para a base. O TikTok apresenta um número de vendas no anúncio;
        aqui usamos esse valor para montar um <strong>ranking por vendas do maior para o menor</strong>, com no máximo{" "}
        <strong>20</strong> linhas. Se quiseres comparar de outra forma, podes <strong>clicar nos títulos das colunas</strong>{" "}
        (por exemplo preço ou nome) — isso só muda a ordem <strong>no ecrã</strong>, não altera os dados na base.
      </p>
      <p style={{ margin: 0 }}>
        Vês <strong>nome do produto, loja, preço, vendas anunciadas e avaliações</strong> conforme foram gravados nessa atualização — é uma
        foto do que está guardado no sistema. <strong>Não é sugestão de compra nem previsão de vendas</strong>; apenas o ranking com base nos
        números que vieram na importação mais recente.
      </p>
    </IntroCard>
  );

  /** Alinhado ao relatório Top: primeiro por vendas, maior→menor. */
  const [sort, setSort] = useState(() => ({ key: "vendas", dir: /** @type {SortDir} */ ("desc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortTopItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_TOP_DESC));
  }, []);

  if (data == null) {
    return (
      <>
        {topIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> vendas do <strong>maior para o menor</strong> (como quando a API responde). Altere
          clicando nos cabeçalhos — não ordenamos <strong>link</strong>.
        </p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

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
        cabeçalhos — não ordenamos <strong>link</strong>.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <SortTh
              label="nome"
              colKey="nome"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="loja"
              colKey="loja"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="rating"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={6} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={`${row.productId}-${i}`}>
              <td style={tdPosStyle}>{i + 1}</td>
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
  const colW = useColumnWidths(CW_OPP);

  const oppIntro = (
    <IntroCard title='O que é "Opportunities" (oportunidades)?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        Aqui o sistema faz uma <strong>pré-seleção automática</strong> entre os dados da última importação — no máximo{" "}
        <strong>20</strong> linhas — com regras <strong>fixas mas simples</strong>: média das avaliações{" "}
        <strong>pelo menos 4,5</strong>,{" "}
        <strong>no mínimo 5 avaliações</strong>, vendas declaradas entre <strong>10 e 300</strong> unidades e com{" "}
        <strong>preço preenchido</strong>. A ideia é destacar produtos bem avaliados que ainda <strong>não são megavolumes</strong>{" "}
        (para explorares antes que fiquem saturados).
      </p>
      <p style={{ margin: 0 }}>
        Na coluna <strong>motivo</strong> aparece texto que relembra estes critérios. Isto ajuda à leitura, mas{" "}
        <strong>não é recomendação de investimento nem substitui o score nem qualquer garantia comercial</strong> — apenas um filtro
        útil dentro daquilo que já tens na base.
      </p>
    </IntroCard>
  );

  /** Oportunidades: métrica forte = média alta; servidor usa média desc. */
  const [sort, setSort] = useState(() => ({ key: "avalMed", dir: /** @type {SortDir} */ ("desc") }));

  const items = useMemo(() => {
    if (rawItems.length === 0) return [];
    return sortOppItemsByColumn(rawItems, sort.key, sort.dir);
  }, [rawItems, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_OPP_DESC));
  }, []);

  if (data == null) {
    return (
      <>
        {oppIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> média de avaliação do <strong>maior para o menor</strong> quando houver dados.
          Altere clicando nos cabeçalhos — não ordenamos <strong>link</strong>.
        </p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

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
        Altere clicando nos cabeçalhos — não ordenamos <strong>link</strong>.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <SortTh
              label="nome"
              colKey="nome"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="loja"
              colKey="loja"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="avalMed"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="motivo"
              colKey="motivo"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={6}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={7} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={`${row.productId}-${i}`}>
              <td style={tdPosStyle}>{i + 1}</td>
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
  const colW = useColumnWidths(CW_SCORE);

  const scoreIntro = (
    <IntroCard title='O que é "Product Score" (score do produto)?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        O <strong>score de 0 a 100</strong> junta vários indícios da <strong>última importação</strong> — por exemplo vendas
        anunciadas, avaliações, se o preço faz sentido, desconto, se cai na faixa de &quot;oportunidade&quot; e, quando há{" "}
        <strong>duas importações comparáveis</strong>, também a <strong>subida ou descida de vendas</strong> relativamente à anterior.
        É calculado <strong>só quando abres esta vista</strong> ou corres o relatório — <strong>não fica gravado</strong> na base como
        coluna oficial.
      </p>
      <p style={{ margin: 0 }}>
        Por defeito vês até <strong>30</strong> produtos ordenados pelo <strong>score mais alto primeiro</strong>; nos cabeçalhos podes ordenar por outras colunas (nome, loja, etc.).
        Etiquetas como &quot;excelente&quot; ou &quot;bom&quot; são <strong>faixas de leitura</strong>, não promessa de lucro nem modelo de IA; os pesos exactos da fórmula estão descritos na{" "}
        <code style={{ opacity: 0.85 }}>documentação ANALYTICS</code>{" "}
        do projeto para quem quiser ir ao detalhe.
      </p>
    </IntroCard>
  );

  const [sort, setSort] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const rows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return sortScoreRowsByColumn(rawRows, sort.key, sort.dir);
  }, [rawRows, sort]);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_SCORE_DESC));
  }, []);

  if (data == null) {
    return (
      <>
        {scoreIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong>. Métricas numéricas fazem primeiro
          clique maior→menor; nome e loja A→Z — aplicável assim que os dados aparecerem.
        </p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

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
        Métricas numéricas fazem primeiro clique maior→menor; nome e loja A→Z.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <SortTh
              label="score"
              colKey="score"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="classificação"
              colKey="classific"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="nome"
              colKey="nome"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="loja"
              colKey="loja"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={6}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="rating"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="delta"
              colKey="delta"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={9} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.productId}-${i}`}>
              <td style={tdPosStyle}>{i + 1}</td>
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
  const colWSub = useColumnWidths(CW_MAP_SUB);
  const colWTop = useColumnWidths(CW_MAP_TOP);

  const mapIntro = (
    <IntroCard title='O que é o "Mapa de categoria"?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        O mapa agrupa os produtos da <strong>última importação</strong> por <strong>pasta ou categoria do TikTok Shop</strong>{" "}
        (a partir do link de categoria de cada produto). Em vez de mostrar o URL completo, a tabela apresenta o{" "}
        <strong>nome da categoria</strong> e o <strong>identificador numérico</strong> num formato simples tipo &quot;nome · ID&quot;{" "}
        — assim fica legível onde havia apenas parâmetros e endereços compridos atrás das cenas.
      </p>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        A <strong>primeira tabela</strong> faz um resumo por sub-categoria: quantos produtos, totais de vendas, médias de preço e avaliações, uma coluna de <strong>score médio</strong> (é a <strong>média simples</strong> das pontuações 0–100 desses produtos, como na aba Product Score, apenas calculada enquanto estás aqui), e conta de «oportunidades» com as mesmas regras gerais usadas mais acima neste painel.
      </p>
      <p style={{ margin: 0 }}>
        <strong>Mais abaixo</strong>, uma <strong>segunda tabela</strong> lista <strong>exemplos de produtos em destaque</strong> dentro de cada pasta — para ver casos concretos; tal como nas outras abas, só estás a ler dados já importados e ordenar no ecrã pelos cabeçalhos.
      </p>
    </IntroCard>
  );

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

  if (data == null) {
    return (
      <>
        {mapIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial (subcategorias):</strong> <strong>score</strong> médio da sub da maior para a menor.
          Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong> e{" "}
          <strong>classificação</strong> em A→Z. Depois de carregar, a resposta pode incluir uma nota técnica do servidor
          sobre o método de score.
        </p>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "#eaf2f9" }}>
          SKU em destaque (top por score em cada subcategoria)
        </h3>
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor na listagem combinada. Métricas
          numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong> e <strong>nome</strong> em A→Z.
          O link não é ordenável.
        </p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher as tabelas.</p>
      </>
    );
  }

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
        Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong> e{" "}
        <strong>classificação</strong> em A→Z.{" "}
        {data.scoreMethod ? <span style={{ opacity: 0.88 }}>{data.scoreMethod}</span> : null}.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: "1.35rem" }}>
        <colgroup>{colWSub.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWSub.onGripMouseDown} />
            <SortTh
              label="mestre"
              colKey="masterName"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={1}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="categoria · ID"
              colKey="subName"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={2}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="score"
              colKey="score"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={3}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="classificação"
              colKey="classification"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={4}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="produtos"
              colKey="totalProducts"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={5}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="vendas (Σ)"
              colKey="totalSales"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={6}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="rating méd."
              colKey="avgRating"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={7}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="preço méd."
              colKey="avgPrice"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={8}
              onGrip={colWSub.onGripMouseDown}
            />
            <SortTh
              label="oport."
              colKey="opportunities"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSort={onSortSub}
              resizeColIdx={9}
              onGrip={colWSub.onGripMouseDown}
            />
          </tr>
        </thead>
        <tbody>
          {sortedSubcats.map((row, idx) => {
            const { mestre, categoria } = mapCategoryTableLabels(row.masterName, row.subName);
            return (
              <tr key={row._key}>
                <td style={{ ...tdStyle, ...tdPosStyle }}>{idx + 1}</td>
                <td style={tdStyle}>{mestre}</td>
                <td style={tdStyle}>{categoria}</td>
              <td style={tdStyle}>{row.score}</td>
              <td style={tdStyle}>{row.classification}</td>
              <td style={tdStyle}>{row.totalProducts}</td>
              <td style={tdStyle}>{row.totalSales}</td>
              <td style={tdStyle}>{row.avgRating}</td>
              <td style={tdStyle}>{row.avgPrice}</td>
              <td style={tdStyle}>{row.opportunities}</td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "#eaf2f9" }}>
        SKU em destaque (top por score em cada subcategoria)
      </h3>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor nesta listagem combinada.
        Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong> e{" "}
        <strong>nome</strong> em A→Z. O link não é ordenável.
        <span style={{ opacity: 0.85, display: "block", marginTop: "0.25rem" }}>
          Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.
        </span>
      </p>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colWTop.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWTop.onGripMouseDown} />
            <SortTh
              label="mestre"
              colKey="masterName"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={1}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="categoria · ID"
              colKey="subName"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={2}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="nome"
              colKey="nome"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={3}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="score"
              colKey="score"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={4}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={5}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="rating"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={6}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={7}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="Δ vendas"
              colKey="delta"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={8}
              onGrip={colWTop.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={9} onGrip={colWTop.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {sortedTops.map((row, i) => {
            const { mestre, categoria } = mapCategoryTableLabels(row.masterName, row.subName);
            return (
              <tr key={row.rowKey || i}>
                <td style={{ ...tdStyle, ...tdPosStyle }}>{i + 1}</td>
                <td style={tdStyle}>{mestre}</td>
                <td style={tdStyle}>{categoria}</td>
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
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function TableScalableSections({ data }) {
  const rawV = asArray(data?.validatedToScale);
  const rawP = asArray(data?.potentialBets);
  const colW = useColumnWidths(CW_SCALE);

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

  const escalarIntro = (
    <IntroCard title='O que é "Escalar" neste painel?'>
      <p style={{ margin: "0 0 0.6rem 0" }}>
        <strong>Escalar</strong>, neste contexto, é pensar <strong>onde investir mais esforço ou visibilidade</strong> num produto do TikTok Shop — por
        exemplo mais anúncios, mais stock ou repetir um formato de vídeo que funciona — <strong>com base na última vez que os dados foram importados</strong>.
      </p>
      <p style={{ margin: 0 }}>
        Há <strong>duas listas</strong> com regras diferentes: uma para artigos com <strong>vendas e avaliações já mais sólidas</strong> (candidatos a &quot;validados&quot;) e outra para <strong>artigos ainda pequenos mas com bons sinais</strong> (candidatos a &quot;apostas&quot;). As duas olham para <strong>todos os produtos que já receberam score nesta importação</strong>, não só para as primeiras linhas da tabela resumida de score — servem para apoiar decisões, <strong>sem substituir o teu julgamento nem números internos de margem</strong>.
      </p>
    </IntroCard>
  );

  const escalarOrdemP = (
    <p style={{ fontSize: "0.72rem", opacity: 0.65, marginBottom: "0.65rem" }}>
      Clique num separador para ver só uma lista. Cada lista ordena de forma independente (cabeçalhos clicáveis, excepto{" "}
      <strong>link</strong>).{" "}
      <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor — para <strong>vendas</strong> e{" "}
      <strong>rating</strong>, o primeiro clique também é maior→menor; <strong>nome</strong> fica A→Z. Arraste a borda entre
      colunas nos cabeçalhos para ajustar a largura.
    </p>
  );

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

  if (data == null) {
    return (
      <>
        {escalarIntro}
        {escalarOrdemP}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            type="button"
            disabled
            style={{ ...pill(false), opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" }}
          >
            1 · Validados para escalar ({0})
          </button>
          <button
            type="button"
            disabled
            style={{ ...pill(false), opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" }}
          >
            2 · Apostas com potencial ({0})
          </button>
        </div>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher as listas.</p>
      </>
    );
  }

  if (data?.message && !data?.scrapeRun) {
    return (
      <>
        {escalarIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }

  const renderRows = (list) =>
    list.map((row, i) => (
      <tr key={`${row.productId}-${i}`}>
        <td style={tdPosStyle}>{i + 1}</td>
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
      {escalarIntro}
      {escalarOrdemP}

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
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <colgroup>{colW.colElements}</colgroup>
              <thead>
                <tr>
                  <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
                  <SortTh
                    label="nome"
                    colKey="nome"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={1}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="score"
                    colKey="score"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="vendas"
                    colKey="vendas"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="rating"
                    colKey="rating"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh label="link" resizeColIdx={5} onGrip={colW.onGripMouseDown} />
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
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <colgroup>{colW.colElements}</colgroup>
              <thead>
                <tr>
                  <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
                  <SortTh
                    label="nome"
                    colKey="nome"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={1}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="score"
                    colKey="score"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="vendas"
                    colKey="vendas"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="rating"
                    colKey="rating"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh label="link" resizeColIdx={5} onGrip={colW.onGripMouseDown} />
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
