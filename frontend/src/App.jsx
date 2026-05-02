import { Suspense, lazy, useState, useCallback, useMemo } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AnalyticsDashboardCacheProvider, useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import AppShell from "./AppShell.jsx";
import CategoriesPage from "./CategoriesPage.jsx";
import HandsOnPage from "./HandsOnPage.jsx";
import ProductWorkspacePage from "./ProductWorkspacePage.jsx";
import {
  INITIAL_FILTER_STATE,
  PRODUCT_SCORE_PRESETS,
  applyProductFilters,
  filtersAreInactive
} from "./productFilters.js";
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
import PdpEnrichButton from "./PdpEnrichButton.jsx";
import { SpacesExportActionCell, SpacesExportFeedback, useSpacesExport } from "./spacesExport.jsx";

const CategoryAnalyticsPage = lazy(() => import("./CategoryAnalyticsPage.jsx"));

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
        borderBottom: active ? "2px solid var(--tk-accent)" : undefined,
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
/** Células com ellipsis; texto completo no `title` (tooltip). */
const tdEllipsis = {
  maxWidth: "14rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  verticalAlign: "middle"
};
const positionThTitle = "Posição na ordenação atual (1, 2, 3…)";
/** Caixa introdutória (mesmo padrão visual da aba Escalar). */
function IntroCard({ title, children }) {
  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "1rem 1.15rem",
        borderRadius: "var(--tk-radius-lg)",
        border: "1px solid var(--tk-border)",
        background: "var(--tk-surface)",
        boxShadow: "var(--tk-shadow-sm)"
      }}
    >
      <h2
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          margin: "0 0 0.55rem 0",
          letterSpacing: "-0.02em",
          color: "var(--tk-text)"
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: "0.8rem", color: "var(--tk-text-muted)", lineHeight: 1.58 }}>{children}</div>
    </section>
  );
}

/** Avisos (⚠️) e listas dentro dos IntroCard */
const introWarn = {
  margin: "0.55rem 0 0",
  padding: "0.5rem 0.65rem",
  fontSize: "0.78rem",
  lineHeight: 1.45,
  borderRadius: "var(--tk-radius-sm)",
  borderLeft: "3px solid var(--tk-warning-edge)",
  background: "var(--tk-warning-bg)",
  color: "var(--tk-text)",
  opacity: 0.93
};
const introBullet = {
  margin: "0 0 0.6rem",
  paddingLeft: "1.15rem",
  lineHeight: 1.55
};
const introLead = { margin: "0 0 0.55rem", lineHeight: 1.55 };
const introLabel = {
  margin: "0 0 0.3rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  opacity: 0.95
};
/** Caixa discreta “lógica por dentro” (alinhada ao relatório na API). */
const introLogicBox = {
  margin: "0.55rem 0 0",
  padding: "0.5rem 0.65rem",
  fontSize: "0.76rem",
  lineHeight: 1.52,
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)",
  color: "var(--tk-text-muted)",
  opacity: 0.96
};
const introLogicUl = { margin: "0.35rem 0 0", paddingLeft: "1.05rem", lineHeight: 1.5 };
const introLogicLabel = {
  margin: "0 0 0.15rem",
  fontSize: "0.79rem",
  fontWeight: 600,
  opacity: 0.92,
  letterSpacing: "0.01em"
};

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
const CW_TOP = [52, 175, 88, 88, 105, 68, 74, 78, 82, 76];
const CW_OPP = [52, 155, 80, 80, 95, 64, 70, 74, 84, 74, 62];
const CW_SCORE = [52, 58, 100, 140, 76, 76, 112, 72, 78, 74, 72, 88, 94, 66];
const CW_MAP_SUB = [52, 120, 200, 64, 120, 80, 90, 80, 80, 76];
const CW_MAP_TOP = [48, 92, 138, 138, 76, 76, 52, 68, 62, 62, 52, 82, 56];
const CW_SCALE = [48, 132, 74, 74, 52, 68, 76, 74, 54];

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function TableTop({ data }) {
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_TOP);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();

  const topIntro = (
    <IntroCard title="Top Products">
      <p style={introLead}>
        Mostra os produtos com mais vendas na <strong>última importação</strong>. Use para entender o que já tem demanda,
        mas lembre-se: produtos muito vendidos também podem ter mais concorrência.
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Complemento ao ecrã (como Product Score)</div>
        <ul style={introLogicUl}>
          <li>
            Coluna <strong>Ações</strong>: <strong>Exportar</strong> ao DigitalOcean Spaces — credenciais{" "}
            <code>SPACES_*</code> só no servidor; mesmo POST que Product Score.
          </li>
          <li>
            O <strong>nome</strong> abre a <strong>página de trabalho</strong> (<code>/produto/…</code>); a coluna{" "}
            <strong>link</strong> abre o PDP no TikTok.
          </li>
        </ul>
      </div>
      <div style={{ ...introWarn, marginTop: "0.65rem", borderLeftColor: "rgb(148 163 184 / 0.35)", background: "var(--tk-surface-inset)" }}>
        Até <strong>20</strong> linhas, ordenação inicial por vendas (maior → menor); dados do snapshot na base —
        não são tempo real do TikTok.
      </div>
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
          clicando nos cabeçalhos — não ordenamos <strong>link</strong> nem <strong>Ações</strong>.
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
        cabeçalhos — não ordenamos <strong>link</strong> nem <strong>Ações</strong>. O <strong>nome</strong> abre a{" "}
        <strong>página de trabalho</strong> (<code>/produto/…</code>) quando o produto tem <code>productId</code>.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
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
              label="categoria"
              colKey="categoriaPrincipal"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="sub"
              colKey="subcategoria"
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
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
              resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={9} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => {
            const nomeStr = typeof row.nome === "string" ? row.nome : row.nome != null ? String(row.nome) : "";
            const nomeTitle = nomeStr !== "" ? nomeStr : undefined;
            const pid = row.productId;
            const hasProductId = pid != null && String(pid).trim() !== "";
            return (
              <tr key={`${row.productId}-${i}`}>
                <td style={tdPosStyle}>{i + 1}</td>
                <td>
                  {hasProductId ? (
                    <Link
                      to={`/produto/${encodeURIComponent(String(pid).trim())}`}
                      title={nomeTitle ?? "Abrir página de trabalho deste produto"}
                      style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}
                    >
                      {row.nome ?? "—"}
                    </Link>
                  ) : (
                    <span title={nomeTitle}>{row.nome ?? "—"}</span>
                  )}
                </td>
                <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
                  {row.categoriaPrincipal ?? "—"}
                </td>
                <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                  {row.subcategoria ?? "—"}
                </td>
                <td style={tdEllipsis} title={typeof row.loja === "string" ? row.loja : undefined}>
                  {row.loja ?? "—"}
                </td>
                <td>{row.preco ?? "—"}</td>
                <td>{row.vendas ?? "—"}</td>
                <td>
                  {typeof row.avaliacao === "number" && Number.isFinite(row.avaliacao)
                    ? row.avaliacao.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2
                      })
                    : "—"}
                </td>
                <SpacesExportActionCell
                  productId={pid}
                  nome={row.nome}
                  exportingProductId={exportingProductId}
                  exportToSpace={exportToSpace}
                />
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
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function TableOpp({ data }) {
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_OPP);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();

  const oppIntro = (
    <IntroCard title="Opportunities">
      <p style={introLead}>
        <strong>Produtos bem avaliados que ainda não são grandes volumes.</strong> Seleccionados automaticamente na última
        importação com regras simples: <strong>avaliação média alta</strong>, <strong>mínimo de avaliações</strong>, vendas na{" "}
        <strong>faixa intermediária</strong> e <strong>preço definido</strong> — até <strong>20</strong> linhas (detalhes em Analytics v1 nos docs).
      </p>
      <div style={introLabel}>👉 Use para:</div>
      <ul style={introBullet}>
        <li>encontrar produtos com boa aceitação</li>
        <li>entrar antes de ficarem saturados</li>
      </ul>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>último scrape;</li>
          <li>
            filtros na base: <strong>preço</strong> definido; média de avaliação <strong>≥ 4,5</strong>; total de avaliações{" "}
            <strong>≥ 5</strong>; vendas entre <strong>10 e 300</strong>;
          </li>
          <li>
            ordenação principal: melhor média de avaliação (com desempate por vendas); <strong>máx. 20</strong> linhas.
          </li>
          <li>
            Coluna <strong>Ações</strong>: <strong>Exportar</strong> ao DigitalOcean Spaces (credenciais só no servidor — como
            nos outros relatórios com produtos).
          </li>
        </ul>
      </div>
      <div style={introWarn}>⚠️ É um filtro exploratório — não garante resultado.</div>
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
          Altere clicando nos cabeçalhos — não ordenamos <strong>link</strong> nem <strong>Ações</strong>.
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
        Altere clicando nos cabeçalhos — não ordenamos <strong>link</strong> nem <strong>Ações</strong>.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
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
              label="categoria"
              colKey="categoriaPrincipal"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="sub"
              colKey="subcategoria"
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
              colKey="avalMed"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="motivo"
              colKey="motivo"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
              resizeColIdx={9}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={10} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={`${row.productId}-${i}`}>
              <td style={tdPosStyle}>{i + 1}</td>
              <td>{row.nome}</td>
              <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
                {row.categoriaPrincipal ?? "—"}
              </td>
              <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                {row.subcategoria ?? "—"}
              </td>
              <td>{row.loja}</td>
              <td>{row.preco ?? "—"}</td>
              <td>{row.vendas ?? "—"}</td>
              <td>
                {row.avalMed != null ? `${row.avalMed} (${row.avalTot ?? "—"} aval)` : "—"}
              </td>
              <td>{row.motivo ?? "—"}</td>
              <SpacesExportActionCell
                productId={row.productId}
                nome={row.nome}
                exportingProductId={exportingProductId}
                exportToSpace={exportToSpace}
              />
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

const scoreFilterInput = {
  width: "4rem",
  padding: "0.28rem 0.35rem",
  fontSize: "0.78rem",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)",
  color: "var(--tk-text)",
  boxSizing: "border-box"
};
const scorePresetBtn = {
  padding: "0.32rem 0.6rem",
  fontSize: "0.76rem",
  cursor: "pointer",
  borderRadius: "var(--tk-radius-md)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface)",
  color: "var(--tk-text)",
  lineHeight: 1.35
};

/**
 * Presets preenchem apenas rascunho — o utilizador clica em «Aplicar filtros».
 * @param {{
 *   filterDraft: import("./productFilters.js").ProductFilterState,
 *   setFilterDraft: (u: import("./productFilters.js").ProductFilterState | ((p: import("./productFilters.js").ProductFilterState) => import("./productFilters.js").ProductFilterState)) => void,
 *   onApply: () => void,
 *   onClear: () => void,
 *   rawCount: number,
 *   filteredCount: number,
 *   appliedInactive: boolean,
 * }} props
 */
function ScoreFilterPanel({ filterDraft, setFilterDraft, onApply, onClear, rawCount, filteredCount, appliedInactive }) {
  /** @param {keyof import("./productFilters.js").ProductFilterState} key */
  const mk = (key) => ({
    value: filterDraft[key],
    onChange: /** @param {React.ChangeEvent<HTMLInputElement>} e */ (e) =>
      setFilterDraft((f) => ({ ...f, [key]: e.target.value }))
  });

  return (
    <section
      style={{
        marginBottom: "0.85rem",
        padding: "0.65rem 0.85rem",
        borderRadius: "var(--tk-radius-md)",
        border: "1px solid var(--tk-border)",
        background: "var(--tk-surface-raised)"
      }}
      aria-label="Filtros da tabela Product Score"
    >
      <div style={{ fontSize: "0.76rem", opacity: 0.88, marginBottom: "0.45rem", fontWeight: 600 }}>Presets rápidos</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
        {PRODUCT_SCORE_PRESETS.map((p) => (
          <button key={p.id} type="button" style={scorePresetBtn} title={p.description} onClick={() => setFilterDraft(p.fill)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: "0.76rem", opacity: 0.82, marginBottom: "0.38rem" }}>Campos (preenchem o rascunho; vazio = sem limite)</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem 0.85rem",
          alignItems: "baseline",
          marginBottom: "0.55rem",
          fontSize: "0.76rem"
        }}
      >
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Preço min</span>
          <input {...mk("precoMin")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Preço max</span>
          <input {...mk("precoMax")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Vendas min</span>
          <input {...mk("vendasMin")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Vendas max</span>
          <input {...mk("vendasMax")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Rating min</span>
          <input {...mk("ratingMin")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ opacity: 0.9 }}>Score min</span>
          <input {...mk("scoreMin")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" />
        </label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={onApply}
          style={{
            padding: "0.35rem 0.85rem",
            fontSize: "0.78rem",
            cursor: "pointer",
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-btn-primary-hover)",
            background: "var(--tk-btn-primary)",
            color: "#fff",
            fontWeight: 600
          }}
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={onClear}
          style={{
            padding: "0.35rem 0.75rem",
            fontSize: "0.78rem",
            cursor: "pointer",
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-border)",
            background: "var(--tk-surface)",
            color: "var(--tk-text)"
          }}
        >
          Limpar
        </button>
        <span style={{ fontSize: "0.72rem", opacity: 0.78 }}>
          Mostrando <strong>{filteredCount}</strong> de <strong>{rawCount}</strong> produtos (lista API{" "}
          {rawCount <= 30 ? "até 30" : String(rawCount)} · filtros só no cliente).
        </span>
        {!appliedInactive ? (
          <span style={{ fontSize: "0.7rem", opacity: 0.85, color: "var(--tk-accent)", fontWeight: 500 }}>Filtros activos</span>
        ) : null}
      </div>
    </section>
  );
}

function TableScore({ data }) {
  const rawRows = asArray(data?.top);
  const colW = useColumnWidths(CW_SCORE);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();

  const scoreIntro = (
    <IntroCard title="Product Score">
      <p style={introLead}>
        <strong>Ranking com base em múltiplos factores.</strong> O sistema calcula uma nota de <strong>0 a 100</strong> combinando (entre
        outros) <strong>vendas</strong>, <strong>avaliações</strong>, <strong>preço</strong>, <strong>desconto</strong>,{" "}
        <strong>faixa de oportunidade</strong> e <strong>variação de vendas</strong> face ao run anterior, quando esse cálculo é possível —
        sempre sobre a <strong>última importação</strong>, apenas <strong>em memória</strong> (não grava coluna oficial na base).
      </p>
      <p style={{ ...introLead, marginBottom: "0.45rem" }}>
        👉 Lista principal até <strong>30 produtos</strong> ordenados por score (cabeçalhos permitem ordenar só no ecrã).
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>
            pontua cada produto do último import de <strong>0 a 100</strong> (vendas, avaliações, preço, desconto, faixa de
            oportunidade e — quando existe run anterior comparável — <strong>variação de vendas</strong>);
          </li>
          <li>
            ordena todos por score; este ecrã mostra só o <strong>top 30</strong> (o restante entra no cálculo geral quando aplicável).
          </li>
          <li>
            Colunas <strong>PDP</strong> (enriquecer <code>output/dados_produtos.json</code> no servidor via CLI) e <strong>Ações</strong>{" "}
            (<strong>Exportar</strong> ao Spaces; credenciais <code>SPACES_*</code> só no servidor). O <strong>nome</strong> da linha é o
            atalho para a página de trabalho.
          </li>
          <li>
            O <strong>nome</strong> abre a <strong>página de trabalho</strong> (<code>/produto/…</code>); o histórico de aberturas fica em <strong>Produtos em análise</strong> (<code>/a-mao</code>).
          </li>
        </ul>
      </div>
      <div style={introWarn}>
        ⚠️ Score interno da aplicação — não representa lucro nem é um indicador oficial do TikTok.
      </div>
    </IntroCard>
  );

  const [sort, setSort] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));
  const [filterDraft, setFilterDraft] = useState(() => ({ ...INITIAL_FILTER_STATE }));
  const [filterApplied, setFilterApplied] = useState(() => ({ ...INITIAL_FILTER_STATE }));

  const filteredRows = useMemo(() => applyProductFilters(rawRows, filterApplied), [rawRows, filterApplied]);

  const rows = useMemo(() => {
    if (filteredRows.length === 0) return [];
    return sortScoreRowsByColumn(filteredRows, sort.key, sort.dir);
  }, [filteredRows, sort]);

  const onApplyFilters = useCallback(() => {
    setFilterApplied({ ...filterDraft });
  }, [filterDraft]);

  const onClearFilters = useCallback(() => {
    setFilterDraft({ ...INITIAL_FILTER_STATE });
    setFilterApplied({ ...INITIAL_FILTER_STATE });
  }, []);

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_SCORE_DESC));
  }, []);

  if (data == null) {
    return (
      <>
        {scoreIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong>. Métricas numéricas fazem primeiro
          clique maior→menor; nome, categoria, sub e loja A→Z — aplicável assim que os dados aparecerem.
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
      <ScoreFilterPanel
        filterDraft={filterDraft}
        setFilterDraft={setFilterDraft}
        onApply={onApplyFilters}
        onClear={onClearFilters}
        rawCount={rawRows.length}
        filteredCount={filteredRows.length}
        appliedInactive={filtersAreInactive(filterApplied)}
      />
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong> (▼ em <strong>score</strong>).
        Métricas numéricas fazem primeiro clique maior→menor; nome, categoria, sub e loja A→Z; <strong>PDP</strong>, <strong>link</strong> e{" "}
        <strong>Ações</strong> não se ordenam.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>
      </p>
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
      {filteredRows.length === 0 ? (
        <p style={{ opacity: 0.88 }}>Nenhum produto corresponde aos filtros actuais — ajuste os limites ou clique em Limpar.</p>
      ) : (
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
              label="categoria"
              colKey="categoriaPrincipal"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="sub"
              colKey="subcategoria"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="loja"
              colKey="loja"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={6}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="rating"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={9}
              onGrip={colW.onGripMouseDown}
            />
            <SortTh
              label="delta"
              colKey="delta"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={onSort}
              resizeColIdx={10}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="PDP"
              title="Enriquecer PDP no servidor (npm run pdp:enrich)"
              resizeColIdx={11}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
              resizeColIdx={12}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={13} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.productId}-${i}`}>
              <td style={tdPosStyle}>{i + 1}</td>
              <td>{row.score}</td>
              <td>{row.classific}</td>
              <td>
                <Link
                  to={`/produto/${encodeURIComponent(row.productId)}`}
                  title="Abrir página de trabalho deste produto"
                  style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}
                >
                  {row.nome}
                </Link>
              </td>
              <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
                {row.categoriaPrincipal ?? "—"}
              </td>
              <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                {row.subcategoria ?? "—"}
              </td>
              <td>{row.loja}</td>
              <td>{row.preco ?? "—"}</td>
              <td>{row.vendas ?? "—"}</td>
              <td>{row.rating ?? "—"}</td>
              <td>{row.deltaVendas ?? "—"}</td>
              <td style={{ verticalAlign: "top", padding: "0.35rem 0.3rem", overflow: "visible" }}>
                <PdpEnrichButton productId={row.productId} />
              </td>
              <SpacesExportActionCell
                productId={row.productId}
                nome={row.nome}
                exportingProductId={exportingProductId}
                exportToSpace={exportToSpace}
              />
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
      )}
    </>
  );
}

function TableCategoryMap({ data }) {
  const masters = asArray(data?.masterCategories);
  const colWSub = useColumnWidths(CW_MAP_SUB);
  const colWTop = useColumnWidths(CW_MAP_TOP);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();

  const mapIntro = (
    <IntroCard title='Mapa de categorias'>
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55 }}>
        <strong>Visão geral dos produtos agrupados por categoria.</strong> Agrupa com base nas categorias/ligações já{" "}
        guardadas nos produtos (<strong>a partir do texto ou URL na importação</strong> — normalmente TikTok Shop: nome legível e ID, sem repetir trackers longos).
      </p>
      <div style={introLabel}>📊 Métricas agregadas por pasta (primeira tabela):</div>
      <ul style={{ ...introBullet, marginBottom: "0.5rem" }}>
        <li>quantidade de produtos</li>
        <li>vendas totais</li>
        <li>médias de preço e de avaliação</li>
        <li>score médio da pasta (média simples das pontuações 0–100 dos produtos dali)</li>
      </ul>
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55 }}>
        Há também uma segunda listagem combinada <strong>SKU em destaque</strong> entre pastas — até <strong>cinco</strong> por subcategoria ordenados por score.
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>
            agrupa produtos da última importação pela <strong>categoria</strong> extraída do texto ou URL gravados (heurística de pasta / TikTok quando aplica);
          </li>
          <li>
            por pasta calcula contagens, somas de vendas, médias de preço e rating; o <strong>score da pasta</strong> é a média simples das pontuações 0–100 dos produtos;
          </li>
          <li>
            em cada subcategoria lista até <strong>cinco</strong> produtos exemplo, pela ordem de score descendente; na segunda
            tabela, <strong>Exportar</strong> usa o mesmo fluxo Spaces que nos outros relatórios.
          </li>
        </ul>
      </div>
      <div style={introLabel}>👉 Use para:</div>
      <ul style={introBullet}>
        <li>entender quais categorias estão mais fortes</li>
        <li>identificar onde focar</li>
      </ul>
      <div style={introWarn}>⚠️ Categorias derivadas dos dados importados — não são classificações oficiais do TikTok.</div>
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

  /** @type {{
   * masterName: string,
   * subName: string,
   * nome: string,
   * categoriaPrincipal: string,
   * subcategoria: string,
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
            categoriaPrincipal: p.categoriaPrincipal ?? "—",
            subcategoria: p.subcategoria ?? "—",
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
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>
          SKU em destaque (top por score em cada subcategoria)
        </h3>
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
          <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor na listagem combinada. Métricas
          numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong>,{" "}
          <strong>nome</strong>, <strong>cat. SKU</strong> e <strong>sub SKU</strong> em A→Z.
          O link não é ordenável; a coluna <strong>Ações</strong> (export) também não.
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

      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>
        SKU em destaque (top por score em cada subcategoria)
      </h3>
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor nesta listagem combinada.
        Métricas numéricas: primeiro clique maior→menor; <strong>mestre</strong>, <strong>categoria</strong>,{" "}
        <strong>nome</strong>, <strong>cat. SKU</strong> e <strong>sub SKU</strong> em A→Z. O link e <strong>Ações</strong> (export)
        não são ordenáveis.
        <span style={{ opacity: 0.85, display: "block", marginTop: "0.25rem" }}>
          Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.
        </span>
      </p>
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
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
              label="cat. SKU"
              colKey="categoriaPrincipal"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={4}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="sub SKU"
              colKey="subcategoria"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={5}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="score"
              colKey="score"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={6}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="vendas"
              colKey="vendas"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={7}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="rating"
              colKey="rating"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={8}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="preço"
              colKey="preco"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={9}
              onGrip={colWTop.onGripMouseDown}
            />
            <SortTh
              label="Δ vendas"
              colKey="delta"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSort={onSortTop}
              resizeColIdx={10}
              onGrip={colWTop.onGripMouseDown}
            />
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
              resizeColIdx={11}
              onGrip={colWTop.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={12} onGrip={colWTop.onGripMouseDown} />
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
                <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.categoriaPrincipal ?? "")}>
                  {row.categoriaPrincipal ?? "—"}
                </td>
                <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.subcategoria ?? "")}>
                  {row.subcategoria ?? "—"}
                </td>
                <td style={tdStyle}>{row.score}</td>
                <td style={tdStyle}>{row.vendas ?? "—"}</td>
                <td style={tdStyle}>{row.rating != null ? row.rating : "—"}</td>
                <td style={tdStyle}>{row.preco != null ? row.preco : "—"}</td>
                <td style={tdStyle}>{row.delta != null ? row.delta : "—"}</td>
                <SpacesExportActionCell
                  productId={row.productId}
                  nome={row.nome}
                  exportingProductId={exportingProductId}
                  exportToSpace={exportToSpace}
                  tdStyle={tdStyle}
                />
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
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();

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
    <IntroCard title="🔥 Escalar">
      <p style={introLead}>
        <strong>Sugestão de onde focar esforço</strong> com base nos dados já importados. Em duas vistas —{" "}
        <strong>Validados para escalar</strong> e <strong>Apostas com potencial</strong> — aplica filtros diferentes sobre{" "}
        candidatos que passaram por triagem técnica.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
        <div style={{ flex: "1 1 200px" }}>
          <strong>✅ Validados</strong>
          <ul style={{ ...introBullet, marginTop: "0.25rem", marginBottom: "0.15rem" }}>
            <li>já têm vendas consistentes</li>
            <li>boas avaliações (segundo critérios do relatório)</li>
          </ul>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <strong>🧪 Potencial</strong>
          <ul style={{ ...introBullet, marginTop: "0.25rem", marginBottom: "0.15rem" }}>
            <li>vendas menores</li>
            <li>bons sinais de qualidade</li>
          </ul>
        </div>
      </div>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>
            parte da <strong>pontuação completa</strong> de todos os produtos do último import (mesma fórmula do Product Score, não apenas os ~30 da outra vista);
          </li>
          <li>
            aplica <strong>exclusões globais</strong> primeiro (por exemplo preço inválido, vendas demasiado altas, avaliação média baixa segundo as regras do relatório);
          </li>
          <li>
            depois divide o que sobrou em <strong>Validados</strong> (critérios de volume + avaliações + score) e <strong>Apostas com potencial</strong> (vendas mais baixas mas com bons sinais de avaliações e score).
          </li>
          <li>
            Em cada lista, <strong>Exportar</strong> na coluna <strong>Ações</strong> envia o produto ao DigitalOcean Spaces
            (credenciais só no servidor), como nos outros relatórios.
          </li>
        </ul>
      </div>
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55 }}>
        👉 Este relatório atravessa <strong>todos os produtos já pontuados</strong> no último import (universo do score completo na base), não
        só os ~30 primeiro da vista Product Score.
      </p>
      <div style={introWarn}>
        ⚠️ Não considera margem, logística nem estratégia de venda próprios — apenas sinais calculados sobre os dados.
      </div>
    </IntroCard>
  );

  const escalarOrdemP = (
    <p style={{ fontSize: "0.72rem", opacity: 0.65, marginBottom: "0.65rem" }}>
      Clique num separador para ver só uma lista. Cada lista ordena de forma independente (cabeçalhos clicáveis, excepto{" "}
      <strong>link</strong> e <strong>Ações</strong>).{" "}
      <strong>Ordem inicial:</strong> <strong>score</strong> do maior para o menor — para <strong>vendas</strong> e{" "}
      <strong>rating</strong>, o primeiro clique também é maior→menor; <strong>nome</strong>, <strong>categoria</strong> e <strong>sub</strong> em A→Z. Arraste a borda entre
      colunas nos cabeçalhos para ajustar a largura.
    </p>
  );

  const pill = (active) => ({
    padding: "0.42rem 1rem",
    cursor: "pointer",
    borderRadius: "var(--tk-radius-md)",
    border: active ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)",
    background: active ? "var(--tk-accent-soft)" : "var(--tk-surface)",
    color: "var(--tk-text)",
    fontWeight: active ? 600 : 400,
    fontSize: "0.85rem",
    boxShadow: active ? "var(--tk-shadow-sm)" : "none"
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
        <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
          {row.categoriaPrincipal ?? "—"}
        </td>
        <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
          {row.subcategoria ?? "—"}
        </td>
        <td>{row.score}</td>
        <td>{row.vendas ?? "—"}</td>
        <td>{row.rating ?? "—"}</td>
        <SpacesExportActionCell
          productId={row.productId}
          nome={row.nome}
          exportingProductId={exportingProductId}
          exportToSpace={exportToSpace}
        />
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
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}

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
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>
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
                    label="categoria"
                    colKey="categoriaPrincipal"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="sub"
                    colKey="subcategoria"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="score"
                    colKey="score"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="vendas"
                    colKey="vendas"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={5}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="rating"
                    colKey="rating"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSort={onSortV}
                    resizeColIdx={6}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh
                    label="Ações"
                    title="Exportar ao DigitalOcean Spaces"
                    resizeColIdx={7}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh label="link" resizeColIdx={8} onGrip={colW.onGripMouseDown} />
                </tr>
              </thead>
              <tbody>{renderRows(v)}</tbody>
            </table>
          )}
        </section>
      )}

      {scaleView === "potential" && (
        <section style={{ padding: "0 0 1rem 0" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>
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
                    label="categoria"
                    colKey="categoriaPrincipal"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="sub"
                    colKey="subcategoria"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="score"
                    colKey="score"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="vendas"
                    colKey="vendas"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={5}
                    onGrip={colW.onGripMouseDown}
                  />
                  <SortTh
                    label="rating"
                    colKey="rating"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSort={onSortP}
                    resizeColIdx={6}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh
                    label="Ações"
                    title="Exportar ao DigitalOcean Spaces"
                    resizeColIdx={7}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh label="link" resizeColIdx={8} onGrip={colW.onGripMouseDown} />
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

export function AnalyticsDashboard({ variant = "global", pageTitle, categoryBread }) {
  const { tab, setTab, cache, loading, error, load, tabs, setError } = useAnalyticsDashboardCache();

  const current = tabs.find((t) => t.id === tab);

  const data = current ? cache[current.key] : null;

  const heading = pageTitle ?? "Analytics (API)";

  const showSubLine =
    categoryBread &&
    categoryBread.subcategory !== categoryBread.masterCategory &&
    categoryBread.subcategory !== "—";

  return (
    <main className="tk-page-body">
      <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
      {variant === "category" ? (
        <p style={{ marginBottom: "0.65rem" }}>
          <Link
            to="/"
            style={{ color: "var(--tk-accent)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 }}
          >
            ← Voltar ao início
          </Link>
        </p>
      ) : null}
      <h1
        style={{
          fontSize: "1.35rem",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          marginTop: 0,
          marginBottom: "0.5rem",
          color: "var(--tk-text)"
        }}
      >
        {heading}
      </h1>
      {variant === "category" && categoryBread ? (
        <div
          style={{
            fontSize: "0.86rem",
            lineHeight: 1.48,
            marginBottom: "0.55rem",
            padding: "0.6rem 0.85rem",
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-border)",
            background: "var(--tk-surface-raised)",
            color: "var(--tk-text-muted)"
          }}
          aria-label="Pasta TikTok derivada da URL da categoria"
        >
          <p style={{ margin: "0 0 0.25rem", opacity: 0.92 }}>
            <span style={{ opacity: 0.7 }}>Categoria principal:</span>{" "}
            <strong>{categoryBread.masterCategory}</strong>
          </p>
          {showSubLine ? (
            <p style={{ margin: 0, opacity: 0.92 }}>
              <span style={{ opacity: 0.7 }}>Subcategoria:</span>{" "}
              <strong>{categoryBread.subcategory}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      {variant === "category" ? (
        <>
          <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Relatórios filtrados com <code>categoryUrl</code> na API (mesmos separadores que o painel global). O separador
            activo só recebe dados após <strong>Carregar dados</strong>.
          </p>
          <p style={{ fontSize: "0.72rem", opacity: 0.68, marginTop: "0.35rem", lineHeight: 1.48, maxWidth: "46rem" }}>
            Para ver <strong>todos</strong> os produtos da última importação, use{" "}
            <Link to="/analytics" style={{ color: "var(--tk-accent)", fontWeight: 500 }}>
              Analytics
            </Link>{" "}
            global.
          </p>
          <p style={{ fontSize: "0.72rem", opacity: 0.66, marginTop: "0.35rem", lineHeight: 1.45, maxWidth: "46rem" }}>
            Ao voltar do <strong>workspace do produto</strong> ou de <strong>Produtos em análise</strong>, os dados já
            carregados nesta vista mantêm-se na sessão — recarregue só quando quiser actualizar da API.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Métricas em GET pelo Fastify · export Space e página por produto (ver doc). Proxy do Vite em dev para evitar CORS.
          </p>
          <p style={{ fontSize: "0.72rem", opacity: 0.68, marginTop: "0.35rem", lineHeight: 1.48, maxWidth: "46rem" }}>
            <strong>Resumo:</strong> Top = maior volume · Opportunities = boa aceitação antes de grandes volumes · Product Score =
            ranking interno (0–100) · Escalar = dois grupos de foco sobre tudo o que já tem score · Mapa = força das categorias nos
            dados importados.
          </p>
          <p style={{ fontSize: "0.72rem", opacity: 0.66, marginTop: "0.35rem", lineHeight: 1.45, maxWidth: "46rem" }}>
            Ao voltar do <strong>workspace do produto</strong> ou de <strong>Produtos em análise</strong>, os dados já carregados
            mantêm-se nesta sessão — use <strong>Carregar dados</strong> só quando quiser actualizar da API.
          </p>
        </>
      )}

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
              padding: "0.48rem 0.92rem",
              cursor: "pointer",
              borderRadius: "var(--tk-radius-md)",
              border:
                tab === t.id ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)",
              background: tab === t.id ? "var(--tk-accent-soft)" : "var(--tk-surface)",
              color: "var(--tk-text)",
              fontWeight: tab === t.id ? 600 : 500,
              fontSize: "0.82rem",
              boxShadow: tab === t.id ? "var(--tk-shadow-sm)" : "none",
              transition: "background 0.12s ease, border-color 0.12s ease"
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
            padding: "0.45rem 1.1rem",
            cursor: loading ? "wait" : "pointer",
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-btn-primary-hover)",
            background: loading ? "var(--tk-btn-primary-hover)" : "var(--tk-btn-primary)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.85rem",
            boxShadow: "var(--tk-shadow-sm)"
          }}
        >
          {loading ? "Carregando..." : "Carregar dados"}
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--tk-danger)", marginTop: "0.5rem" }}>
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
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<CategoriesPage />} />
          <Route path="categorias" element={<Navigate to="/" replace />} />
          <Route
            path="analytics"
            element={
              <AnalyticsDashboardCacheProvider>
                <AnalyticsDashboard />
              </AnalyticsDashboardCacheProvider>
            }
          />
        <Route
          path="categoria/:categorySlug"
          element={
            <Suspense
              fallback={
                <main className="tk-page-body">
                  <div className="tk-content-wrap" style={{ color: "var(--tk-text)" }}>
                    <p style={{ opacity: 0.85 }}>Carregando…</p>
                  </div>
                </main>
              }
            >
              <CategoryAnalyticsPage />
            </Suspense>
          }
        />
          <Route path="a-mao" element={<HandsOnPage />} />
          <Route path="produto/:productId" element={<ProductWorkspacePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
