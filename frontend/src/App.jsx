import { Suspense, lazy, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AnalyticsDashboardCacheProvider, TOP_PRODUCTS_UI_FETCH_LIMIT, OPPORTUNITIES_UI_FETCH_LIMIT, useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import AppShell from "./AppShell.jsx";
import CategoriesPage from "./CategoriesPage.jsx";
import HandsOnPage from "./HandsOnPage.jsx";
import ProductWorkspacePage from "./ProductWorkspacePage.jsx";
import ShortlistPage from "./ShortlistPage.jsx";
import {
  INITIAL_FILTER_STATE,
  PRODUCT_SCORE_PRESETS,
  applyProductFilters,
  filtersAreInactive
} from "./productFilters.js";
import { localizeCategoryBread, mapCategoryTableLabelsPt } from "./mapCategoryUi.js";
import { translateCategoryPathEnToPt } from "./tiktokCategoryLabelsPt.js";
import { ColumnResizeGrip, useColumnWidths } from "./useColumnWidths.jsx";
import {
  sortMapSubcatsByColumn,
  sortMapTopProductsByColumn,
  sortOppItemsByColumn,
  sortScalableRowsByColumn,
  sortScoreRowsByColumn,
  sortTopItemsByColumn,
  firstFloat,
  parseDelta as parseDeltaVendasStr
} from "./sortUtils.js";
import PdpEnrichButton from "./PdpEnrichButton.jsx";
import { SpacesExportActionCell, SpacesExportFeedback, useSpacesExport } from "./spacesExport.jsx";
import { deriveProductLabels } from "./productLabels.js";
import { getTicketLabel, rowMatchesTicketFilter } from "./ticketLabel.js";

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

/**
 * Cabeçalho tipo Excel: título ordena; ▾ abre filtro por coluna (lista de valores ou min/máx.).
 * @param {{
 *   label: string,
 *   colKey: string,
 *   filterMode: 'text' | 'category' | 'range',
 *   rangeMinKey?: string,
 *   rangeMaxKey?: string,
 *   sortKey: string,
 *   sortDir: SortDir,
 *   onSortLabel: (k: string) => void,
 *   colFilters: Record<string, unknown>,
 *   setColFilters: (
 *     u: Record<string, unknown> | ((p: Record<string, unknown>) => Record<string, unknown>)
 *   ) => void,
 *   menuOpenKey: string | null,
 *   setMenuOpenKey: (k: string | null) => void,
 *   onApplySort: (key: string, dir: SortDir) => void,
 *   datasetRows: readonly Record<string, unknown>[],
 *   rowMatches: (row: Record<string, unknown>, filters: Record<string, unknown>) => boolean,
 *   menuHeaderId?: string,
 *   distinctFieldKey: campo na linha para valores distintos quando difere de colKey,
 *   quickSortShortcut?: { key: string, dir: SortDir, label: string } | null,
 *   resizeColIdx?: number,
 *   onGrip?: (idx: number) => (e: import("react").MouseEvent) => void
 * }} props
 */
function ExcelSortTh({
  label,
  colKey,
  filterMode,
  rangeMinKey,
  rangeMaxKey,
  sortKey,
  sortDir,
  onSortLabel,
  colFilters,
  setColFilters,
  menuOpenKey,
  setMenuOpenKey,
  onApplySort,
  datasetRows,
  rowMatches,
  menuHeaderId,
  distinctFieldKey,
  quickSortShortcut = null,
  resizeColIdx,
  onGrip
}) {
  const hk = menuHeaderId ?? colKey;
  const dField = distinctFieldKey ?? colKey;
  const wrapRef = useRef(/** @type {HTMLTableCellElement | null} */ (null));
  const [listNeedle, setListNeedle] = useState("");
  const open = menuOpenKey === hk;
  const activeSort = sortKey === colKey;
  const resize = resizeColIdx != null && onGrip;

  const relaxedForDistinct = useMemo(
    () => excelRelaxColumnFilters(colFilters, colKey, filterMode, rangeMinKey, rangeMaxKey),
    [colFilters, colKey, filterMode, rangeMinKey, rangeMaxKey]
  );

  const rowsForDistinct = useMemo(() => {
    return datasetRows.filter((r) =>
      rowMatches(/** @type {Record<string, unknown>} */ (r), relaxedForDistinct)
    );
  }, [datasetRows, relaxedForDistinct, rowMatches]);

  const distinctValues = useMemo(
    () => oppDistinctSortedForColumn(rowsForDistinct, dField),
    [rowsForDistinct, dField]
  );

  const filteredDistinct = useMemo(() => {
    const n = listNeedle.trim().toLowerCase();
    if (!n) return distinctValues;
    return distinctValues.filter((opt) => {
      const pt = filterMode === "category" ? translateCategoryPathEnToPt(opt) : opt;
      const hay = `${opt} ${pt}`.toLowerCase();
      return n
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [distinctValues, listNeedle, filterMode]);

  useEffect(() => {
    if (!open) setListNeedle("");
  }, [open]);

  let filterActive = false;
  if (filterMode === "text" || filterMode === "category") {
    filterActive = Array.isArray(colFilters[colKey]);
  } else if (filterMode === "range" && rangeMinKey && rangeMaxKey) {
    filterActive =
      String(colFilters[rangeMinKey] ?? "").trim() !== "" || String(colFilters[rangeMaxKey] ?? "").trim() !== "";
  }

  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (wrapRef.current != null && !wrapRef.current.contains(/** @type {Node} */ (e.target))) {
        setMenuOpenKey(null);
      }
    };
    const esc = (e) => {
      if (e.key === "Escape") setMenuOpenKey(null);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [open, setMenuOpenKey]);

  const dropdownBtnStyle = {
    flex: "0 0 1.5rem",
    width: "1.5rem",
    alignSelf: "stretch",
    border: "none",
    borderLeft: "1px solid var(--tk-border-soft)",
    background: filterActive ? "var(--tk-accent-soft)" : "transparent",
    color: filterActive ? "var(--tk-accent)" : "var(--tk-text-muted)",
    cursor: "pointer",
    fontSize: "0.72rem",
    lineHeight: 1,
    padding: 0
  };

  const selRaw = colFilters[colKey];
  const sel = Array.isArray(selRaw) ? /** @type {readonly string[]} */ (selRaw) : null;

  const optionChecked = (/** @type {string} */ opt) => (sel === null ? true : sel.includes(opt));

  const toggleDistinctValue = (/** @type {string} */ opt) => {
    setColFilters((prev) => {
      const rel = excelRelaxColumnFilters(prev, colKey, filterMode, rangeMinKey, rangeMaxKey);
      const subset = datasetRows.filter((r) =>
        rowMatches(/** @type {Record<string, unknown>} */ (r), rel)
      );
      const full = oppDistinctSortedForColumn(subset, dField);
      const cur = prev[colKey];
      let next = cur === null ? [...full] : [.../** @type {string[]} */ (cur)];
      if (next.includes(opt)) next = next.filter((x) => x !== opt);
      else next = [...next, opt];
      if (next.length === 0) return { ...prev, [colKey]: /** @type {typeof selRaw} */ ([]) };
      if (full.length > 0 && next.length === full.length) return { ...prev, [colKey]: null };
      return { ...prev, [colKey]: /** @type {typeof selRaw} */ (next) };
    });
  };

  return (
    <th
      ref={wrapRef}
      scope="col"
      style={{
        position: "relative",
        verticalAlign: "middle",
        padding: 0,
        paddingRight: resize ? "0.65rem" : 0,
        boxSizing: "border-box",
        overflow: "visible"
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", minHeight: "2rem" }}>
        <button
          type="button"
          title="Ordenar por esta coluna"
          onClick={() => onSortLabel(colKey)}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            textAlign: "left",
            cursor: "pointer",
            border: "none",
            background: "transparent",
            color: "var(--tk-text)",
            font: "inherit",
            padding: "0.4rem 0.3rem 0.4rem 0.5rem",
            borderBottom: activeSort ? "2px solid var(--tk-accent)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.3rem"
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ flex: "0 0 auto", opacity: activeSort ? 1 : 0.38, fontSize: "0.68rem" }} aria-hidden>
            {activeSort ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={`Filtro e ordenação: ${label}`}
          title="Filtro e ordenação (estilo Excel)"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpenKey(open ? null : hk);
          }}
          style={dropdownBtnStyle}
        >
          ▾
        </button>
      </div>
      {resize ? <ColumnResizeGrip onMouseDown={onGrip(resizeColIdx)} /> : null}
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            left: 0,
            top: "100%",
            marginTop: "1px",
            zIndex: 100,
            minWidth: "15rem",
            maxWidth: "min(22rem, 94vw)",
            padding: "0.5rem 0.55rem",
            borderRadius: "var(--tk-radius-md)",
            border: "1px solid var(--tk-border)",
            background: "var(--tk-surface-raised)",
            boxShadow: "0 8px 28px rgb(0 0 0 / 0.5)"
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.88, marginBottom: "0.35rem" }}>Ordenar</div>
          {filterMode === "range" ? (
            <>
              <button
                type="button"
                className="tk-btn-soft"
                style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.72rem", padding: "0.32rem" }}
                onClick={() => onApplySort(colKey, "asc")}
              >
                Do menor para o maior
              </button>
              <button
                type="button"
                className="tk-btn-soft"
                style={{ width: "100%", marginBottom: "0.45rem", fontSize: "0.72rem", padding: "0.32rem" }}
                onClick={() => onApplySort(colKey, "desc")}
              >
                Do maior para o menor
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="tk-btn-soft"
                style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.72rem", padding: "0.32rem" }}
                onClick={() => onApplySort(colKey, "asc")}
              >
                De A a Z
              </button>
              <button
                type="button"
                className="tk-btn-soft"
                style={{ width: "100%", marginBottom: "0.45rem", fontSize: "0.72rem", padding: "0.32rem" }}
                onClick={() => onApplySort(colKey, "desc")}
              >
                De Z a A
              </button>
            </>
          )}
          <div style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.88, margin: "0.35rem 0" }}>Filtrar</div>
          {filterMode === "text" || filterMode === "category" ? (
            <>
              <input
                type="search"
                placeholder="Pesquisar na lista…"
                autoComplete="off"
                value={listNeedle}
                onChange={(e) => setListNeedle(e.target.value)}
                style={{ ...oppFilterInputStyle, width: "100%", maxWidth: "100%", marginBottom: "0.35rem" }}
              />
              <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tk-btn-soft"
                  style={{ fontSize: "0.68rem", padding: "0.22rem 0.4rem", flex: "1 1 auto" }}
                  onClick={() => setColFilters((prev) => ({ ...prev, [colKey]: null }))}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  className="tk-btn-soft"
                  style={{ fontSize: "0.68rem", padding: "0.22rem 0.4rem", flex: "1 1 auto" }}
                  onClick={() =>
                    setColFilters((prev) => ({ ...prev, [colKey]: [] }))
                  }
                >
                  Desmarcar todas
                </button>
              </div>
              <div
                style={{
                  maxHeight: "11rem",
                  overflowY: "auto",
                  marginBottom: "0.35rem",
                  borderRadius: "var(--tk-radius-sm)",
                  border: "1px solid var(--tk-border-soft)",
                  background: "var(--tk-surface-inset)",
                  padding: "0.25rem 0.35rem"
                }}
              >
                {distinctValues.length === 0 ? (
                  <div style={{ fontSize: "0.72rem", opacity: 0.75, padding: "0.25rem 0" }}>
                    Sem valores (outros filtros podem ter escondido todas as linhas).
                  </div>
                ) : filteredDistinct.length === 0 ? (
                  <div style={{ fontSize: "0.72rem", opacity: 0.75, padding: "0.25rem 0" }}>Nada corresponde à pesquisa.</div>
                ) : (
                  filteredDistinct.map((opt) => {
                    const display = filterMode === "category" ? translateCategoryPathEnToPt(opt) : opt;
                    return (
                      <label
                        key={opt}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.4rem",
                          fontSize: "0.72rem",
                          lineHeight: 1.35,
                          padding: "0.2rem 0",
                          cursor: "pointer",
                          color: "var(--tk-text)"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={optionChecked(opt)}
                          onChange={() => toggleDistinctValue(opt)}
                          style={{ marginTop: "0.12rem", flex: "0 0 auto" }}
                        />
                        <span style={{ wordBreak: "break-word", minWidth: 0 }} title={filterMode === "category" ? opt : undefined}>
                          {display}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.35rem" }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Mín."
                aria-label={`${label} mínimo`}
                value={colFilters[rangeMinKey] ?? ""}
                onChange={(e) => setColFilters((prev) => ({ ...prev, [rangeMinKey]: e.target.value }))}
                style={{ ...oppFilterInputStyle, flex: 1, width: "auto", minWidth: 0 }}
              />
              <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>—</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Máx."
                aria-label={`${label} máximo`}
                value={colFilters[rangeMaxKey] ?? ""}
                onChange={(e) => setColFilters((prev) => ({ ...prev, [rangeMaxKey]: e.target.value }))}
                style={{ ...oppFilterInputStyle, flex: 1, width: "auto", minWidth: 0 }}
              />
            </div>
          )}
          <button
            type="button"
            className="tk-btn-soft"
            style={{ width: "100%", fontSize: "0.7rem", padding: "0.28rem", marginBottom: "0.35rem" }}
            onClick={() => {
              if (filterMode === "range" && rangeMinKey && rangeMaxKey) {
                setColFilters((prev) => ({ ...prev, [rangeMinKey]: "", [rangeMaxKey]: "" }));
              } else {
                setColFilters((prev) => ({ ...prev, [colKey]: null }));
              }
            }}
          >
            Limpar filtro desta coluna
          </button>
          {quickSortShortcut ? (
            <button
              type="button"
              style={{
                width: "100%",
                fontSize: "0.68rem",
                padding: "0.28rem",
                cursor: "pointer",
                border: "1px dashed var(--tk-border)",
                borderRadius: "var(--tk-radius-sm)",
                background: "var(--tk-surface-inset)",
                color: "var(--tk-text-muted)"
              }}
              onClick={() => onApplySort(quickSortShortcut.key, quickSortShortcut.dir)}
            >
              {quickSortShortcut.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </th>
  );
}

/** Cabeçalho Excel na aba Opportunities — atalho rápido ordena por rating médio. */
function OppExcelSortTh(props) {
  return (
    <ExcelSortTh
      {...props}
      rowMatches={oppRowMatchesColFilters}
      quickSortShortcut={{ key: "avalMed", dir: "desc", label: "Ordenação da lista (rating ↓)" }}
    />
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

const productLabelsChipWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.28rem",
  marginTop: "0.22rem",
  alignItems: "center",
  maxWidth: "100%"
};
const productLabelChipStyle = {
  fontSize: "0.68rem",
  lineHeight: 1.35,
  padding: "0.12rem 0.42rem",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)",
  color: "var(--tk-text-muted)",
  fontWeight: 500,
  whiteSpace: "nowrap"
};

/**
 * Chips só de cliente (derivam de dados já na linha; não alteram API).
 * @param {{ row: Record<string, unknown> }} props
 */
function ProductLabelsChips({ row }) {
  const labels = deriveProductLabels(row);
  if (!labels.length) return null;
  const titleStr = labels.map((l) => `${l.emoji} ${l.label}`).join(", ");
  return (
    <span style={productLabelsChipWrap} title={titleStr} aria-label={titleStr}>
      {labels.map((l) => (
        <span key={l.id} style={productLabelChipStyle}>
          <span aria-hidden>{l.emoji}</span>&nbsp;{l.label}
        </span>
      ))}
    </span>
  );
}

const TICKET_TIER_BADGE = {
  baixo: { background: "rgb(220 252 231 / 0.65)", borderColor: "rgb(134 239 172 / 0.55)", color: "rgb(20 83 45)" },
  medio: { background: "rgb(254 249 195 / 0.75)", borderColor: "rgb(250 204 21 / 0.45)", color: "rgb(113 63 18)" },
  alto: { background: "rgb(254 226 226 / 0.65)", borderColor: "rgb(252 165 165 / 0.55)", color: "rgb(127 29 29)" }
};

const TICKET_FILTER_OPTIONS = /** @type {const} */ ([
  { id: "all", label: "Todos" },
  { id: "alto", label: "Ticket alto" },
  { id: "medio", label: "Ticket médio" },
  { id: "baixo", label: "Ticket baixo" },
  { id: "medio_alto", label: "Médio+Alto" },
  { id: "baixo_medio", label: "Baixo+Médio" }
]);

/**
 * Filtro só no browser sobre as linhas já carregadas na aba.
 * @param {{ value: 'all' | 'baixo' | 'medio' | 'alto' | 'medio_alto' | 'baixo_medio', onChange: (v: 'all' | 'baixo' | 'medio' | 'alto' | 'medio_alto' | 'baixo_medio') => void }} props
 */
function TicketFilterBar({ value, onChange }) {
  return (
    <div
      role="group"
      aria-label="Filtro rápido por faixa de preço (lista já carregada nesta vista)"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem", alignItems: "center", marginBottom: "0.55rem" }}
    >
      <span style={{ fontSize: "0.74rem", opacity: 0.78, fontWeight: 600, marginRight: "0.2rem" }}>Ticket:</span>
      {TICKET_FILTER_OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() =>
              onChange(/** @type {'all' | 'baixo' | 'medio' | 'alto' | 'medio_alto' | 'baixo_medio'} */ (opt.id))
            }
            style={{
              padding: "0.32rem 0.62rem",
              cursor: "pointer",
              borderRadius: "var(--tk-radius-md)",
              border: active ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)",
              background: active ? "var(--tk-accent-soft)" : "var(--tk-surface)",
              color: "var(--tk-text)",
              fontWeight: active ? 600 : 500,
              fontSize: "0.76rem"
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** @param {{ row: Record<string, unknown>, tdExtra?: import("react").CSSProperties }} props */
function TicketBadgeCell({ row, tdExtra = {} }) {
  const t = getTicketLabel(row);
  if (!t.tier) {
    return (
      <td
        style={{ fontSize: "0.74rem", verticalAlign: "middle", color: "var(--tk-text-muted)", ...tdExtra }}
        title={t.label}
      >
        —
      </td>
    );
  }
  const st = TICKET_TIER_BADGE[t.tier];
  return (
    <td style={{ fontSize: "0.74rem", verticalAlign: "middle", ...tdExtra }} title={t.label}>
      <span
        style={{
          display: "inline-block",
          padding: "0.1rem 0.42rem",
          borderRadius: "var(--tk-radius-sm)",
          border: `1px solid ${st.borderColor}`,
          background: st.background,
          color: st.color,
          fontWeight: 600,
          fontSize: "0.72rem"
        }}
      >
        {t.shortLabel}
      </span>
    </td>
  );
}

const positionThTitle = "Posição na ordenação actual (1, 2, 3…)";
/**
 * Balão ao pairar (?); orientação ao humano sem ocupar espaço fixo na página.
 */
function HoverHelpTooltip({ ariaLabel, children }) {
  return (
    <span className="tk-help-hover">
      <button type="button" className="tk-help-hover__btn" aria-label={ariaLabel} tabIndex={0}>
        ?
      </button>
      <div className="tk-help-hover__panel" role="tooltip">
        {children}
      </div>
    </span>
  );
}
/** Caixa introdutória (mesmo padrão visual da aba Escalar). Opcional elemento ao lado do título (ex.: ajuda). */
function IntroCard({ title, titleAside, children }) {
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
          color: "var(--tk-text)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.4rem"
        }}
      >
        <span>{title}</span>
        {titleAside != null ? titleAside : null}
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
const CW_TOP = [52, 168, 86, 86, 100, 64, 54, 72, 76, 80, 74, 72];
const CW_OPP = [52, 148, 76, 76, 90, 60, 52, 66, 70, 72, 78, 72, 58];
const CW_SCORE = [52, 56, 96, 128, 72, 72, 100, 50, 64, 70, 68, 66, 82, 86, 60];
const CW_MAP_SUB = [52, 120, 200, 64, 120, 80, 90, 80, 80, 76];
const CW_MAP_TOP = [48, 92, 138, 138, 76, 76, 52, 68, 62, 62, 52, 82, 56];
const CW_SCALE = [48, 124, 70, 70, 50, 64, 66, 52, 68, 66, 50];

/** Top Products: linhas compactas até expandir (API pode trazer até `TOP_PRODUCTS_UI_FETCH_LIMIT`). */
const TOP_PRODUCTS_VISIBLE_DEFAULT = 20;

/** Opportunities: igual padrão — API pode trazer até `OPPORTUNITIES_UI_FETCH_LIMIT`. */
const OPPORTUNITIES_VISIBLE_DEFAULT = 20;

/** Modos API `GET /analytics/opportunities?mode=` — rótulos PT; `description` visível na aba; `titleTip` no pairar. */
const OPP_MODE_OPTIONS = /** @type {const} */ ([
  {
    id: "classic",
    label: "Clássico",
    description:
      "Produtos com bom rating, avaliações mínimas e vendas em faixa de oportunidade.",
    titleTip: "API: mode=classic — faixa de vendas com sinais de qualidade (ver docs)."
  },
  {
    id: "low_sales",
    label: "Pouca venda",
    description: "Produtos com poucas vendas, mas sinais positivos de avaliação.",
    titleTip: "API: mode=low_sales — volume de vendas reduzido na regra do servidor."
  },
  {
    id: "no_sales",
    label: "Sem vendas",
    description:
      "Produtos com vendas 0 ou ausentes. Não exige avaliações, porque produtos sem venda normalmente ainda não têm reviews.",
    titleTip: "API: mode=no_sales — preço definido; vendas 0 ou nulas; sem mínimo de rating/reviews (ver docs/ANALYTICS.md)."
  },
  {
    id: "below_median",
    label: "Abaixo da mediana",
    description: "Produtos abaixo da mediana de vendas da categoria, mas com bons sinais.",
    titleTip: "API: mode=below_median — abaixo da mediana de vendas da categoria (servidor)."
  }
]);
/** Filtros por coluna na aba Opportunities (`null` em texto/categoria = «todas» como no Excel). */
const OPP_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria", "loja", "motivo"]);

const OPP_COL_FILTERS_INITIAL = {
  nome: null,
  categoriaPrincipal: null,
  subcategoria: null,
  loja: null,
  motivo: null,
  precoMin: "",
  precoMax: "",
  vendasMin: "",
  vendasMax: "",
  avalMedMin: "",
  avalMedMax: ""
};

/** Filtros tipo Excel nas outras abas (mesmo modelo: texto/categoria = `null` ou array). */
const TOP_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria", "loja"]);

const TOP_FILTERS_INITIAL = {
  nome: null,
  categoriaPrincipal: null,
  subcategoria: null,
  loja: null,
  precoMin: "",
  precoMax: "",
  vendasMin: "",
  vendasMax: "",
  ratingMin: "",
  ratingMax: ""
};

const SCORE_COL_TEXT_KEYS = /** @type {const} */ (["classific", "nome", "categoriaPrincipal", "subcategoria", "loja"]);

const SCORE_EXCEL_FILTERS_INITIAL = {
  classific: null,
  nome: null,
  categoriaPrincipal: null,
  subcategoria: null,
  loja: null,
  scoreMin: "",
  scoreMax: "",
  precoMin: "",
  precoMax: "",
  vendasMin: "",
  vendasMax: "",
  ratingMin: "",
  ratingMax: "",
  deltaMin: "",
  deltaMax: ""
};

const MAP_SUB_COL_TEXT_KEYS = /** @type {const} */ (["masterName", "subName", "classification"]);

const MAP_SUB_FILTERS_INITIAL = {
  masterName: null,
  subName: null,
  classification: null,
  scoreMin: "",
  scoreMax: "",
  totalProductsMin: "",
  totalProductsMax: "",
  totalSalesMin: "",
  totalSalesMax: "",
  avgRatingMin: "",
  avgRatingMax: "",
  avgPriceMin: "",
  avgPriceMax: "",
  opportunitiesMin: "",
  opportunitiesMax: ""
};

const MAP_TOP_COL_TEXT_KEYS = /** @type {const} */ (["masterName", "subName", "nome", "categoriaPrincipal", "subcategoria"]);

const MAP_TOP_FILTERS_INITIAL = {
  masterName: null,
  subName: null,
  nome: null,
  categoriaPrincipal: null,
  subcategoria: null,
  scoreMin: "",
  scoreMax: "",
  vendasMin: "",
  vendasMax: "",
  ratingMin: "",
  ratingMax: "",
  precoMin: "",
  precoMax: "",
  deltaMin: "",
  deltaMax: ""
};

const SCALE_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria"]);

const SCALE_FILTERS_INITIAL = {
  nome: null,
  categoriaPrincipal: null,
  subcategoria: null,
  scoreMin: "",
  scoreMax: "",
  vendasMin: "",
  vendasMax: "",
  ratingMin: "",
  ratingMax: ""
};

/**
 * Copia filtros sem restricções na coluna indicada — para lista de valores do menu ▾ (como no Excel).
 * @param {typeof OPP_COL_FILTERS_INITIAL} f
 * @param {string} omitColKey
 * @param {'text' | 'category' | 'range'} omitMode
 * @param {string} [rkMin]
 * @param {string} [rkMax]
 */
function excelRelaxColumnFilters(f, omitColKey, omitMode, rkMin, rkMax) {
  const o = { ...f };
  if (omitMode === "text" || omitMode === "category") {
    const k = omitColKey;
    o[k] = null;
  } else if (omitMode === "range" && rkMin && rkMax) {
    o[rkMin] = "";
    o[rkMax] = "";
  }
  return o;
}

/**
 * @param {readonly Record<string, unknown>[]} rows
 * @param {string} columnKey campo no objeto linha API
 */
function oppDistinctSortedForColumn(rows, columnKey) {
  const set = new Set();
  for (const row of rows) {
    const v = String(row[columnKey] ?? "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

/**
 * @param {unknown} cellRaw valor da célula
 * @param {readonly string[] | null | undefined} allow allowlist inclusiva; [] = nunca passa (tudo desmarcado)
 */
function oppMatchTextAllowlist(cellRaw, allow) {
  if (allow == null) return true;
  const v = String(cellRaw ?? "").trim();
  return allow.includes(v);
}

/** @param {unknown} cell */
function oppNumericCell(cell) {
  if (cell == null || cell === "") return NaN;
  const n = Number(String(cell).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Limite numérico a partir do input (vazio = sem filtro).
 * @param {string} s
 */
function oppParseBoundInput(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 * @param {typeof OPP_COL_FILTERS_INITIAL} f
 */
function oppRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome == null ? null : f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal == null ? null : f.categoriaPrincipal))
    return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria == null ? null : f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja == null ? null : f.loja)) return false;
  if (!oppMatchTextAllowlist(row.motivo, f.motivo == null ? null : f.motivo)) return false;

  const preco = oppNumericCell(row.preco);
  const pmn = oppParseBoundInput(f.precoMin);
  const pmx = oppParseBoundInput(f.precoMax);
  if (pmn != null && (Number.isNaN(preco) || preco < pmn)) return false;
  if (pmx != null && (Number.isNaN(preco) || preco > pmx)) return false;

  const vendas = oppNumericCell(row.vendas);
  const vmn = oppParseBoundInput(f.vendasMin);
  const vmx = oppParseBoundInput(f.vendasMax);
  if (vmn != null && (Number.isNaN(vendas) || vendas < vmn)) return false;
  if (vmx != null && (Number.isNaN(vendas) || vendas > vmx)) return false;

  const rating = oppNumericCell(row.avalMed);
  const rmn = oppParseBoundInput(f.avalMedMin);
  const rmx = oppParseBoundInput(f.avalMedMax);
  if (rmn != null && (Number.isNaN(rating) || rating < rmn)) return false;
  if (rmx != null && (Number.isNaN(rating) || rating > rmx)) return false;

  return true;
}

/**
 * Listas texto (arrays) ou pares numéricos preenchidos nos filtros Excel.
 */
function excelColumnFiltersSomeActive(f, textKeys, rangePairs) {
  for (let i = 0; i < textKeys.length; i++) {
    if (Array.isArray(f[textKeys[i]])) return true;
  }
  for (let i = 0; i < rangePairs.length; i++) {
    const [a, b] = rangePairs[i];
    if (String(f[a] ?? "").trim() !== "" || String(f[b] ?? "").trim() !== "") return true;
  }
  return false;
}

/**
 * @param {typeof TOP_FILTERS_INITIAL} f filtros estado
 */
function topRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome == null ? null : f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal == null ? null : f.categoriaPrincipal))
    return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria == null ? null : f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja == null ? null : f.loja)) return false;

  const preco = oppNumericCell(row.preco);
  const pmn = oppParseBoundInput(f.precoMin);
  const pmx = oppParseBoundInput(f.precoMax);
  if (pmn != null && (Number.isNaN(preco) || preco < pmn)) return false;
  if (pmx != null && (Number.isNaN(preco) || preco > pmx)) return false;

  const vendas = oppNumericCell(row.vendas);
  const vmn = oppParseBoundInput(f.vendasMin);
  const vmx = oppParseBoundInput(f.vendasMax);
  if (vmn != null && (Number.isNaN(vendas) || vendas < vmn)) return false;
  if (vmx != null && (Number.isNaN(vendas) || vendas > vmx)) return false;

  const rating = oppNumericCell(row.avaliacao);
  const rmn = oppParseBoundInput(f.ratingMin);
  const rmx = oppParseBoundInput(f.ratingMax);
  if (rmn != null && (Number.isNaN(rating) || rating < rmn)) return false;
  if (rmx != null && (Number.isNaN(rating) || rating > rmx)) return false;

  return true;
}

function topAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...TOP_COL_TEXT_KEYS], [
    ["precoMin", "precoMax"],
    ["vendasMin", "vendasMax"],
    ["ratingMin", "ratingMax"]
  ]);
}

/**
 * @param {typeof SCORE_EXCEL_FILTERS_INITIAL} f
 */
function scoreExcelRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.classific, f.classific == null ? null : f.classific)) return false;
  if (!oppMatchTextAllowlist(row.nome, f.nome == null ? null : f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal == null ? null : f.categoriaPrincipal))
    return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria == null ? null : f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja == null ? null : f.loja)) return false;

  const scoreVal = oppNumericCell(row.score);
  if (!boundOk(scoreVal, f.scoreMin, f.scoreMax)) return false;

  const preco = oppNumericCell(row.preco);
  if (!boundOk(preco, f.precoMin, f.precoMax)) return false;

  const vendas = oppNumericCell(row.vendas);
  if (!boundOk(vendas, f.vendasMin, f.vendasMax)) return false;

  const rat = firstFloat(row.rating != null ? String(row.rating) : undefined);
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;

  const dn =
    typeof row.deltaVendas === "string"
      ? parseDeltaVendasStr(row.deltaVendas)
      : oppNumericCell(row.deltaVendas);
  if (!boundOk(dn, f.deltaMin, f.deltaMax)) return false;

  return true;
}

/** @param {number} val @param {string} rawMin @param {string} rawMax */
function boundOk(val, rawMin, rawMax) {
  const mn = oppParseBoundInput(rawMin);
  const mx = oppParseBoundInput(rawMax);
  if (mn != null && (Number.isNaN(val) || val < mn)) return false;
  if (mx != null && (Number.isNaN(val) || val > mx)) return false;
  return true;
}

function scoreExcelAnyColumnFiltersActive(f) {
  return excelColumnFiltersSomeActive(f, [...SCORE_COL_TEXT_KEYS], [
    ["scoreMin", "scoreMax"],
    ["precoMin", "precoMax"],
    ["vendasMin", "vendasMax"],
    ["ratingMin", "ratingMax"],
    ["deltaMin", "deltaMax"]
  ]);
}

/** @param {Record<string, unknown>} row dados agregados da sub na pasta */
function mapSubRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.masterName, f.masterName == null ? null : f.masterName)) return false;
  if (!oppMatchTextAllowlist(row.subName, f.subName == null ? null : f.subName)) return false;
  if (!oppMatchTextAllowlist(row.classification, f.classification == null ? null : f.classification)) return false;

  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.totalProducts), f.totalProductsMin, f.totalProductsMax)) return false;
  if (!boundOk(oppNumericCell(row.totalSales), f.totalSalesMin, f.totalSalesMax)) return false;
  if (!boundOk(oppNumericCell(row.avgRating), f.avgRatingMin, f.avgRatingMax)) return false;
  if (!boundOk(oppNumericCell(row.avgPrice), f.avgPriceMin, f.avgPriceMax)) return false;
  if (!boundOk(oppNumericCell(row.opportunities), f.opportunitiesMin, f.opportunitiesMax)) return false;

  return true;
}

function mapSubAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...MAP_SUB_COL_TEXT_KEYS], [
    ["scoreMin", "scoreMax"],
    ["totalProductsMin", "totalProductsMax"],
    ["totalSalesMin", "totalSalesMax"],
    ["avgRatingMin", "avgRatingMax"],
    ["avgPriceMin", "avgPriceMax"],
    ["opportunitiesMin", "opportunitiesMax"]
  ]);
}

/** @param {Record<string, unknown>} row linha combinada SKU em destaque */
function mapTopRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.masterName, f.masterName == null ? null : f.masterName)) return false;
  if (!oppMatchTextAllowlist(row.subName, f.subName == null ? null : f.subName)) return false;
  if (!oppMatchTextAllowlist(row.nome, f.nome == null ? null : f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal == null ? null : f.categoriaPrincipal))
    return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria == null ? null : f.subcategoria)) return false;

  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;

  const rat = firstFloat(row.rating != null ? String(row.rating) : undefined);
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;

  if (!boundOk(oppNumericCell(row.preco), f.precoMin, f.precoMax)) return false;
  if (!boundOk(oppNumericCell(row.delta), f.deltaMin, f.deltaMax)) return false;

  return true;
}

function mapTopAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...MAP_TOP_COL_TEXT_KEYS], [
    ["scoreMin", "scoreMax"],
    ["vendasMin", "vendasMax"],
    ["ratingMin", "ratingMax"],
    ["precoMin", "precoMax"],
    ["deltaMin", "deltaMax"]
  ]);
}

/** Escalar validados / apostas — mesma estrutura de linha */
function scaleRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome == null ? null : f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal == null ? null : f.categoriaPrincipal))
    return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria == null ? null : f.subcategoria)) return false;

  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;

  const rat = firstFloat(row.rating != null ? String(row.rating) : undefined);
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;

  return true;
}

function scaleAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...SCALE_COL_TEXT_KEYS], [
    ["scoreMin", "scoreMax"],
    ["vendasMin", "vendasMax"],
    ["ratingMin", "ratingMax"]
  ]);
}

/**
 * Algum filtro de coluna activo na tabela Opportunities (checkboxes/lista ou intervalo numérico).
 * @param {typeof OPP_COL_FILTERS_INITIAL} f
 */
function oppAnyOppColumnFiltersActive(f) {
  return excelColumnFiltersSomeActive(f, [...OPP_COL_TEXT_KEYS], [
    ["precoMin", "precoMax"],
    ["vendasMin", "vendasMax"],
    ["avalMedMin", "avalMedMax"]
  ]);
}

const oppFilterInputStyle = {
  width: "5.25rem",
  minWidth: "3.75rem",
  padding: "0.32rem 0.4rem",
  fontSize: "0.76rem",
  borderRadius: "var(--tk-radius-sm)",
  border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)",
  color: "var(--tk-text)",
  boxSizing: "border-box"
};

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

/** Evita navegar para o workspace quando o clique foi em link, botão, export, etc. */
function isInteractiveTableCellClick(ev) {
  const el = ev.target;
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest("a, button, input, select, textarea, label, [role='button']"));
}

/** Texto de categoria/subcategoria da API → rótulo PT quando mapeado (sitemap TikTok). */
function catCellPt(v) {
  if (v == null || String(v).trim() === "") return "—";
  return translateCategoryPathEnToPt(String(v));
}

function TableTop({ data }) {
  const navigate = useNavigate();
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_TOP);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();
  const [expanded, setExpanded] = useState(false);
  /** Filtros por coluna (linhas já carregadas no painel). */
  const [topColFilters, setTopColFilters] = useState(() => ({ ...TOP_FILTERS_INITIAL }));
  /** Qual coluna tem o menu ▾ aberto. */
  const [topMenuKey, setTopMenuKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    setExpanded(false);
    setTopColFilters({ ...TOP_FILTERS_INITIAL });
    setTopMenuKey(null);
  }, [data?.scrapeRun?.id]);

  const topIntro = (
    <IntroCard title="Top Products">
      <p style={introLead}>
        A análise na base faz um ranking por volume declarado: a API ordena apenas por{" "}
        <strong>número de vendas</strong> (<code>sales_count</code>), do maior para o menor —{" "}
        <strong>não</strong> mistura avaliação nem preço nessa ordem inicial. Só entram produtos em que esse campo{" "}
        <strong>tem valor</strong> na lista devolvida; quem ficou sem vendas gravadas na BD não aparece neste relatório.
      </p>
      <p style={{ ...introLead, marginTop: "0.35rem" }}>
        <strong>Origem das linhas:</strong> vista <strong>global</strong> usa snapshots do <strong>último import</strong> já na
        base que tenham vendas registadas; vista <strong>por categoria</strong> (filtro TikTok na API) faz com que, por cada
        produto da pasta, o servidor escolha <strong>um snapshot com vendas</strong> ligado ao run com{" "}
        <strong>data de coleta mais recente</strong> entre os imports daquele produto, e volte a ordenar por vendas a descer. O{" "}
        <strong>limit</strong> alto do painel só define quantas linhas vêm na resposta — rating e preço servem para{" "}
        <strong>interpretar</strong>, não para o ranque servidor.
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Neste painel (dados já carregados)</div>
        <ul style={introLogicUl}>
          <li>
            Clicar no cabeçalho ou <strong>▾</strong> altera apenas <strong>ordenação e filtros locais</strong> no browser; para
            voltar ao ranking da API, carrega dados outra vez ou volta à ordem por vendas.
          </li>
          <li>
            <strong>Ações</strong> → Exportar pelo servidor (<code>SPACES_*</code>). <strong>nome</strong> → trabalho{" "}
            <code>/produto/…</code>. <strong>link</strong> → TikTok.
          </li>
          <li>
            Com <code>productId</code>, pode clicar em <strong>qualquer ponto da linha</strong> (excepto link / Exportar) para abrir o workspace.
          </li>
        </ul>
      </div>
      <div
        style={{
          ...introWarn,
          marginTop: "0.5rem",
          borderLeftColor: "rgb(148 163 184 / 0.35)",
          background: "var(--tk-surface-inset)",
          fontSize: "0.76rem",
          padding: "0.4rem 0.55rem"
        }}
      >
        Por defeito <strong>{TOP_PRODUCTS_VISIBLE_DEFAULT}</strong> linhas · <strong>Ver mais produtos</strong> para o restante na mesma ordem atual. Valores são snapshot na base (não tempo real TikTok).
      </div>
    </IntroCard>
  );

  /** Alinhado ao relatório Top: primeiro por vendas, maior→menor. */
  const [sort, setSort] = useState(() => ({ key: "vendas", dir: /** @type {SortDir} */ ("desc") }));

  const filteredRawTop = useMemo(() => {
    if (rawItems.length === 0) return [];
    return rawItems.filter((row) =>
      topRowMatchesColFilters(/** @type {Record<string, unknown>} */ (row), topColFilters)
    );
  }, [rawItems, topColFilters]);

  const topAfterTicket = useMemo(
    () =>
      filteredRawTop.filter((row) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (row))
      ),
    [filteredRawTop, ticketTier]
  );

  const filtersActiveTopExcel = useMemo(() => topAnyColumnFiltersExcelActive(topColFilters), [topColFilters]);

  const items = useMemo(() => {
    if (topAfterTicket.length === 0) return [];
    return sortTopItemsByColumn(topAfterTicket, sort.key, sort.dir);
  }, [topAfterTicket, sort]);

  const displayRows = useMemo(() => {
    if (items.length <= TOP_PRODUCTS_VISIBLE_DEFAULT || expanded) {
      return items;
    }
    return items.slice(0, TOP_PRODUCTS_VISIBLE_DEFAULT);
  }, [items, expanded]);

  const rankingTotal =
    typeof data?.rankingTotal === "number" && Number.isFinite(data.rankingTotal)
      ? data.rankingTotal
      : topAfterTicket.length;

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_TOP_DESC));
  }, []);

  const onTopApplySort = useCallback((key, dir) => {
    setSort({ key, dir });
    setTopMenuKey(null);
  }, []);

  const hasMoreLocally = items.length > TOP_PRODUCTS_VISIBLE_DEFAULT;

  if (data == null) {
    return (
      <>
        {topIntro}
        <p style={{ fontSize: "0.72rem", opacity: 0.7, marginBottom: "0.45rem" }}>
          Ordem inicial: <strong>vendas</strong> maior→menor (API). Cabeçalhos e <strong>▾</strong> só mudam a lista no ecrã. Não
          ordenamos <strong>link</strong>/<strong>Ações</strong>. Carregue dados acima.
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
      <p style={{ fontSize: "0.72rem", opacity: 0.7, marginBottom: "0.45rem" }}>
        Ordem inicial: <strong>vendas</strong> maior→menor (API). Cabeçalhos e <strong>▾</strong> só reordenam ou filtram no ecrã.{" "}
        Não ordenamos <strong>link</strong>/<strong>Ações</strong>. <strong>nome</strong> → trabalho quando houver{" "}
        <code>productId</code>; também pode clicar na <strong>linha inteira</strong> (excepto link / Exportar). Resize na beira das colunas.
      </p>
      {filtersActiveTopExcel && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>
          Depois dos filtros do ▾ nas colunas: <strong>{filteredRawTop.length}</strong> de {rawItems.length} linha
          {rawItems.length !== 1 ? "s" : ""}.
        </p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Após filtro Ticket: <strong>{topAfterTicket.length}</strong> de {filteredRawTop.length} linha(s) (após ▾ quando activo).
        </p>
      ) : null}
      {rankingTotal > TOP_PRODUCTS_VISIBLE_DEFAULT ? (
        <p style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.55rem" }}>
          <strong>Ranking nesta corrida:</strong> {rankingTotal.toLocaleString("pt-BR")} produto
          {rankingTotal !== 1 ? "s" : ""} com <code>vendas</code> ({hasMoreLocally ? "carregamos a lista até o limite do painel …" : "…"})
          {!hasMoreLocally && data?.truncated !== true ? " (todos listados)." : null}
          {expanded || !hasMoreLocally
            ? ` A mostrar ${items.length.toLocaleString("pt-BR")} na tabela (${expanded ? "vista expandida" : "compacta"}).`
            : null}
          {!expanded && hasMoreLocally
            ? ` A vista compacta mostra os primeiros ${TOP_PRODUCTS_VISIBLE_DEFAULT} pela ordenação atual.`
            : null}
        </p>
      ) : null}
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh
              label="nome"
              colKey="nome"
              filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={{ key: "vendas", dir: "desc", label: "Ordenação da lista (vendas ↓)" }}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="categoria"
              colKey="categoriaPrincipal"
              filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="sub"
              colKey="subcategoria"
              filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="loja"
              colKey="loja"
              filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="preço"
              colKey="preco"
              filterMode="range"
              rangeMinKey="precoMin"
              rangeMaxKey="precoMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ticket"
              title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto"
              resizeColIdx={6}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="vendas"
              colKey="vendas"
              filterMode="range"
              rangeMinKey="vendasMin"
              rangeMaxKey="vendasMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="rating"
              colKey="rating"
              filterMode="range"
              rangeMinKey="ratingMin"
              rangeMaxKey="ratingMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={topColFilters}
              setColFilters={setTopColFilters}
              menuOpenKey={topMenuKey}
              setMenuOpenKey={setTopMenuKey}
              onApplySort={onTopApplySort}
              datasetRows={rawItems}
              rowMatches={topRowMatchesColFilters}
              quickSortShortcut={null}
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
          {items.length === 0 ? (
            <tr>
              <td colSpan={11} style={{ padding: "0.75rem 0.65rem", fontSize: "0.82rem", opacity: 0.9 }}>
                Nenhuma linha com os filtros ▾ actuais.{" "}
                <button type="button" className="tk-btn-soft" onClick={() => setTopColFilters({ ...TOP_FILTERS_INITIAL })}>
                  Limpar filtros de coluna
                </button>
              </td>
            </tr>
          ) : (
            displayRows.map((row) => {
            const pos = items.indexOf(row) + 1;
            const nomeStr = typeof row.nome === "string" ? row.nome : row.nome != null ? String(row.nome) : "";
            const nomeTitle = nomeStr !== "" ? nomeStr : undefined;
            const pid = row.productId;
            const hasProductId = pid != null && String(pid).trim() !== "";
            const pidStr = hasProductId ? String(pid).trim() : "";
            return (
              <tr
                key={`${row.productId}-${pos}`}
                style={{
                  borderBottom: "1px solid var(--tk-border)",
                  cursor: hasProductId ? "pointer" : "default"
                }}
                title={hasProductId ? "Clique na linha para abrir o workspace (excepto link TikTok / Exportar)" : undefined}
                onClick={(e) => {
                  if (!hasProductId) return;
                  if (isInteractiveTableCellClick(e)) return;
                  void navigate(`/produto/${encodeURIComponent(pidStr)}`);
                }}
              >
                <td style={tdPosStyle}>{pos}</td>
                <td>
                  {hasProductId ? (
                    <Link
                      to={`/produto/${encodeURIComponent(pidStr)}`}
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
                  {catCellPt(row.categoriaPrincipal)}
                </td>
                <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                  {catCellPt(row.subcategoria)}
                </td>
                <td style={tdEllipsis} title={typeof row.loja === "string" ? row.loja : undefined}>
                  {row.loja ?? "—"}
                </td>
                <td>{row.preco ?? "—"}</td>
                <TicketBadgeCell row={/** @type {Record<string, unknown>} */ (row)} />
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
          })
          )}
        </tbody>
      </table>
      {hasMoreLocally ? (
        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="tk-btn-soft"
            onClick={() => setExpanded((ex) => !ex)}
          >
            {expanded
              ? "Mostrar só os primeiros 20"
              : `Ver mais produtos (${(items.length - TOP_PRODUCTS_VISIBLE_DEFAULT).toLocaleString("pt-BR")} seguintes pela ordem atual)`}
          </button>
        </div>
      ) : null}
      {data?.truncated === true && rankingTotal > items.length ? (
        <p
          style={{
            fontSize: "0.72rem",
            opacity: 0.72,
            marginTop: "0.55rem",
            maxWidth: "44rem",
            lineHeight: 1.45
          }}
        >
          O servidor devolve até <strong>{TOP_PRODUCTS_UI_FETCH_LIMIT.toLocaleString("pt-BR")}</strong> linhas; nesta corrida
          há pelo menos <strong>{rankingTotal.toLocaleString("pt-BR")}</strong> produtos com vendas registadas —
          aumente <code>TOP_PRODUCTS_UI_FETCH_LIMIT</code> em <code>analyticsDashboardCache.jsx</code> se precisares de lista
          completa no browser.
        </p>
      ) : null}
    </>
  );
}

function TableOpp({ data }) {
  const navigate = useNavigate();
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_OPP);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();
  const { opportunityMode, setOpportunityMode, ticketTier, setTicketTier } = useAnalyticsDashboardCache();
  const [expanded, setExpanded] = useState(false);
  /** Filtros por coluna (subset dos dados já carregados). */
  const [oppColFilters, setOppColFilters] = useState(() => ({ ...OPP_COL_FILTERS_INITIAL }));
  /** Qual coluna tem o menu ▾ aberto (um de cada vez). */
  const [oppMenuKey, setOppMenuKey] = useState(/** @type {string | null} */ (null));
  /** Oportunidades: métrica forte = média alta; servidor usa média desc. */
  const [sort, setSort] = useState(() => ({ key: "avalMed", dir: /** @type {SortDir} */ ("desc") }));

  useEffect(() => {
    setExpanded(false);
    setOppColFilters({ ...OPP_COL_FILTERS_INITIAL });
    setOppMenuKey(null);
  }, [data?.scrapeRun?.id, opportunityMode]);

  const activeOppMode = OPP_MODE_OPTIONS.find((o) => o.id === opportunityMode) ?? OPP_MODE_OPTIONS[0];

  const oppModeToolbar = (
    <div
      role="radiogroup"
      aria-label="Modo do relatório Opportunities"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.45rem", alignItems: "center" }}
    >
      <span style={{ fontSize: "0.76rem", opacity: 0.78, marginRight: "0.25rem", fontWeight: 600 }}>Modo de análise:</span>
      {OPP_MODE_OPTIONS.map(({ id, label, description, titleTip }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={opportunityMode === id}
          aria-label={`${label}. ${description}`}
          title={titleTip}
          onClick={() => setOpportunityMode(id)}
          style={{
            padding: "0.36rem 0.65rem",
            cursor: "pointer",
            borderRadius: "var(--tk-radius-md)",
            border:
              opportunityMode === id ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)",
            background: opportunityMode === id ? "var(--tk-accent-soft)" : "var(--tk-surface)",
            color: "var(--tk-text)",
            fontWeight: opportunityMode === id ? 600 : 500,
            fontSize: "0.78rem",
            boxShadow: opportunityMode === id ? "var(--tk-shadow-sm)" : "none"
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const oppModeDescriptionBlock = (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginBottom: "0.6rem",
        maxWidth: "48rem",
        padding: "0.55rem 0.72rem",
        borderRadius: "var(--tk-radius-md)",
        border: "1px solid var(--tk-border)",
        background: "var(--tk-surface-raised)",
        fontSize: "0.82rem",
        lineHeight: 1.55,
        color: "var(--tk-text)"
      }}
    >
      <strong>{activeOppMode.label}</strong>
      <span style={{ opacity: 0.45, margin: "0 0.35rem" }}>—</span>
      <span style={{ color: "var(--tk-text-muted)" }}>{activeOppMode.description}</span>
    </div>
  );

  const oppHoverHelpBody = (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontWeight: 600, color: "var(--tk-text)" }}>Resumo</p>
      <p style={{ margin: 0, color: "var(--tk-text-muted)", lineHeight: 1.45 }}>
        Último import na base (ou por categoria na vista filtrada). Cada <strong style={{ color: "var(--tk-text)" }}>modo</strong>{" "}
        chama{" "}
        <code style={{ fontSize: "0.74rem" }}>/analytics/opportunities?mode=…</code> (com <code>categoryUrl</code> na vista por
        categoria); o significado operacional de cada modo está no texto sob os botões.
      </p>
      <p style={{ margin: "0.45rem 0 0", color: "var(--tk-text-muted)", lineHeight: 1.45 }}>
        Tabela: clique no cabeçalho ordena · <strong>▾</strong> filtra (só linhas carregadas) · nome ou{" "}
        <strong>linha inteira</strong> (excepto link / Exportar) abre o workspace quando há <code>productId</code> ·{" "}
        <strong>Ações</strong> exporta (servidor). Não é tempo real — ver <code>docs/ANALYTICS.md</code>.
      </p>
      </div>
  );

  const oppIntro = (
    <IntroCard
      title="Opportunities"
      titleAside={
        <HoverHelpTooltip ariaLabel="Resumo do relatório Opportunities e comportamento da tabela">{oppHoverHelpBody}</HoverHelpTooltip>
      }
    >
      <p style={{ ...introLead, marginBottom: 0 }}>
        Use os botões para alternar o <strong>modo da API</strong> · lista compacta = primeiras{" "}
        <strong>{OPPORTUNITIES_VISIBLE_DEFAULT}</strong> linhas (<strong>Ver mais produtos</strong> até{" "}
        {OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")} pedidas à API).
      </p>
    </IntroCard>
  );

  const filteredRaw = useMemo(() => {
    if (rawItems.length === 0) return [];
    return rawItems.filter((row) =>
      oppRowMatchesColFilters(/** @type {Record<string, unknown>} */ (row), oppColFilters)
    );
  }, [rawItems, oppColFilters]);

  const oppAfterTicket = useMemo(
    () =>
      filteredRaw.filter((row) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (row))
      ),
    [filteredRaw, ticketTier]
  );

  const filtersActive = useMemo(() => oppAnyOppColumnFiltersActive(oppColFilters), [oppColFilters]);

  const items = useMemo(() => {
    if (oppAfterTicket.length === 0) return [];
    return sortOppItemsByColumn(oppAfterTicket, sort.key, sort.dir);
  }, [oppAfterTicket, sort]);

  const displayRows = useMemo(() => {
    if (items.length <= OPPORTUNITIES_VISIBLE_DEFAULT || expanded) {
      return items;
    }
    return items.slice(0, OPPORTUNITIES_VISIBLE_DEFAULT);
  }, [items, expanded]);

  const rankingTotalServer =
    typeof data?.rankingTotal === "number" && Number.isFinite(data.rankingTotal)
      ? data.rankingTotal
      : rawItems.length;
  const hasMoreLocally = items.length > OPPORTUNITIES_VISIBLE_DEFAULT;

  const onSort = useCallback((k) => {
    setSort((s) => toggleSort(s.key, s.dir, k, SORT_OPP_DESC));
  }, []);

  const onApplySort = useCallback((key, dir) => {
    setSort({ key, dir });
    setOppMenuKey(null);
  }, []);

  if (data == null) {
    return (
      <>
        {oppModeToolbar}
        {oppModeDescriptionBlock}
        {oppIntro}
        <p style={{ fontSize: "0.72rem", opacity: 0.72, marginBottom: "0.45rem" }}>
          Ordem inicial: rating ↓ · cabeçalho <strong>▾</strong> = filtros · carregue dados acima.
        </p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

  if (data?.message && rawItems.length === 0) {
    return (
      <>
        {oppModeToolbar}
        {oppModeDescriptionBlock}
        {typeof data?.ruleNote === "string" && data.ruleNote.trim() !== "" ? (
          <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.55rem", maxWidth: "48rem", lineHeight: 1.45 }}>
            {data.ruleNote}
          </p>
        ) : null}
        {oppIntro}
        <p style={{ opacity: 0.85 }}>{data.message}</p>
      </>
    );
  }
  if (rawItems.length === 0) {
    return (
      <>
        {oppModeToolbar}
        {oppModeDescriptionBlock}
        {typeof data?.ruleNote === "string" && data.ruleNote.trim() !== "" ? (
          <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.55rem", maxWidth: "48rem", lineHeight: 1.45 }}>
            {data.ruleNote}
          </p>
        ) : null}
        {oppIntro}
        <p>Sem linhas.</p>
      </>
    );
  }
  return (
    <>
      {oppModeToolbar}
      {oppModeDescriptionBlock}
      {typeof data?.ruleNote === "string" && data.ruleNote.trim() !== "" ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.55rem", maxWidth: "48rem", lineHeight: 1.45 }}>
          {data.ruleNote}
        </p>
      ) : null}
      {oppIntro}
      {filtersActive && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>
          Após filtros locais: <strong>{filteredRaw.length}</strong> de {rawItems.length} linha
          {rawItems.length !== 1 ? "s" : ""}.
        </p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Após filtro Ticket: <strong>{oppAfterTicket.length}</strong> de {filteredRaw.length} linha(s) (após ▾ quando activo).
        </p>
      ) : null}
      {rankingTotalServer > OPPORTUNITIES_VISIBLE_DEFAULT ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem", lineHeight: 1.4 }}>
          <strong>{rankingTotalServer.toLocaleString("pt-BR")}</strong> candidatos
          {!hasMoreLocally && data?.truncated !== true ? " (todos na lista)." : null}
          {hasMoreLocally ? ` · até ${OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")} linhas pedidas à API` : null}
          {expanded || !hasMoreLocally
            ? ` · vista ${expanded ? "expandida" : "compacta"} (${items.length.toLocaleString("pt-BR")} linhas)`
            : ""}
          {!expanded && hasMoreLocally
            ? ` · compacta = primeiros ${OPPORTUNITIES_VISIBLE_DEFAULT} pela ordem actual`
            : ""}
          .
        </p>
      ) : null}
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
      <>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
                <OppExcelSortTh
              label="nome"
              colKey="nome"
                  filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="categoria"
              colKey="categoriaPrincipal"
                  filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="sub"
              colKey="subcategoria"
                  filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="loja"
              colKey="loja"
                  filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="preço"
              colKey="preco"
                  filterMode="range"
                  rangeMinKey="precoMin"
                  rangeMaxKey="precoMax"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
                <PlainTh
                  label="Ticket"
                  title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto"
                  resizeColIdx={6}
                  onGrip={colW.onGripMouseDown}
                />
                <OppExcelSortTh
              label="vendas"
              colKey="vendas"
                  filterMode="range"
                  rangeMinKey="vendasMin"
                  rangeMaxKey="vendasMax"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
                  resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="rating"
              colKey="avalMed"
                  filterMode="range"
                  rangeMinKey="avalMedMin"
                  rangeMaxKey="avalMedMax"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
                  resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
                <OppExcelSortTh
              label="motivo"
              colKey="motivo"
                  filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
                  onSortLabel={onSort}
                  colFilters={oppColFilters}
                  setColFilters={setOppColFilters}
                  menuOpenKey={oppMenuKey}
                  setMenuOpenKey={setOppMenuKey}
                  onApplySort={onApplySort}
                  datasetRows={rawItems}
                  resizeColIdx={9}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
                  resizeColIdx={10}
              onGrip={colW.onGripMouseDown}
            />
                <PlainTh label="link" resizeColIdx={11} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      padding: "0.75rem 0.65rem",
                      fontSize: "0.82rem",
                      opacity: 0.9,
                      textAlign: "left",
                      borderTop: "1px solid var(--tk-border-soft)"
                    }}
                  >
                    Nenhuma linha com os filtros actuais. Ajuste o menu <strong>▾</strong> de cada coluna ou{" "}
                    <button type="button" className="tk-btn-soft" onClick={() => setOppColFilters({ ...OPP_COL_FILTERS_INITIAL })}>
                      limpar todos os filtros
                    </button>
                    .
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                const pos = items.indexOf(row) + 1;
                const nomeStr = typeof row.nome === "string" ? row.nome : row.nome != null ? String(row.nome) : "";
                const nomeTitle = nomeStr !== "" ? nomeStr : undefined;
                const pid = row.productId;
                const hasProductId = pid != null && String(pid).trim() !== "";
                const pidStr = hasProductId ? String(pid).trim() : "";
                return (
                  <tr
                    key={`${row.productId}-${pos}`}
                    style={{
                      borderBottom: "1px solid var(--tk-border)",
                      cursor: hasProductId ? "pointer" : "default"
                    }}
                    title={hasProductId ? "Clique na linha para abrir o workspace (excepto link TikTok / Exportar)" : undefined}
                    onClick={(e) => {
                      if (!hasProductId) return;
                      if (isInteractiveTableCellClick(e)) return;
                      void navigate(`/produto/${encodeURIComponent(pidStr)}`);
                    }}
                  >
                    <td style={tdPosStyle}>{pos}</td>
                    <td style={{ verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        {hasProductId ? (
                          <Link
                            to={`/produto/${encodeURIComponent(pidStr)}`}
                            title={nomeTitle ?? "Abrir página de trabalho deste produto"}
                            style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}
                          >
                            {row.nome ?? "—"}
                          </Link>
                        ) : (
                          <span title={nomeTitle}>{row.nome ?? "—"}</span>
                        )}
                        <ProductLabelsChips row={/** @type {Record<string, unknown>} */ (row)} />
                      </div>
                    </td>
              <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
                {catCellPt(row.categoriaPrincipal)}
              </td>
              <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                {catCellPt(row.subcategoria)}
              </td>
              <td>{row.loja}</td>
              <td>{row.preco ?? "—"}</td>
                    <TicketBadgeCell row={/** @type {Record<string, unknown>} */ (row)} />
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
                );
                })
              )}
        </tbody>
      </table>
          {hasMoreLocally ? (
            <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button type="button" className="tk-btn-soft" onClick={() => setExpanded((ex) => !ex)}>
                {expanded
                  ? `Mostrar só os primeiros ${OPPORTUNITIES_VISIBLE_DEFAULT}`
                  : `Ver mais produtos (${(items.length - OPPORTUNITIES_VISIBLE_DEFAULT).toLocaleString("pt-BR")} seguintes pela ordem atual)`}
              </button>
            </div>
          ) : null}
      </>
      {data?.truncated === true && rankingTotalServer > rawItems.length ? (
        <p
          style={{
            fontSize: "0.72rem",
            opacity: 0.72,
            marginTop: "0.55rem",
            maxWidth: "44rem",
            lineHeight: 1.45
          }}
        >
          Lista truncada:&nbsp;
          <strong>{rankingTotalServer.toLocaleString("pt-BR")}</strong>+ candidatos; pedido até{" "}
          <strong>{OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")}</strong> linhas —
          aumente <code>OPPORTUNITIES_UI_FETCH_LIMIT</code> em <code>analyticsDashboardCache.jsx</code> se precisar de mais linhas na página.
        </p>
      ) : null}
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
  const navigate = useNavigate();
  const rawRows = asArray(data?.top);
  const colW = useColumnWidths(CW_SCORE);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

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
  /** Filtros cabeçalho tipo Excel (a jusante do painel de presetes). */
  const [scoreExcelColFilters, setScoreExcelColFilters] = useState(() => ({ ...SCORE_EXCEL_FILTERS_INITIAL }));
  const [scoreExcelMenuKey, setScoreExcelMenuKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    setScoreExcelColFilters({ ...SCORE_EXCEL_FILTERS_INITIAL });
    setScoreExcelMenuKey(null);
  }, [data?.scrapeRun?.id]);

  const filteredRows = useMemo(() => applyProductFilters(rawRows, filterApplied), [rawRows, filterApplied]);

  const scoreTicketFiltered = useMemo(
    () =>
      filteredRows.filter((r) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (r))
      ),
    [filteredRows, ticketTier]
  );

  const scoreExcelFiltered = useMemo(
    () =>
      scoreTicketFiltered.filter((r) =>
        scoreExcelRowMatchesColFilters(/** @type {Record<string, unknown>} */ (r), scoreExcelColFilters)
      ),
    [scoreTicketFiltered, scoreExcelColFilters]
  );

  const filtersScoreExcelActive = useMemo(
    () => scoreExcelAnyColumnFiltersActive(scoreExcelColFilters),
    [scoreExcelColFilters]
  );

  const rows = useMemo(() => {
    if (scoreExcelFiltered.length === 0) return [];
    return sortScoreRowsByColumn(scoreExcelFiltered, sort.key, sort.dir);
  }, [scoreExcelFiltered, sort]);

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

  const onScoreExcelApplySort = useCallback((key, dir) => {
    setSort({ key, dir });
    setScoreExcelMenuKey(null);
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
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && filteredRows.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Após filtro Ticket: <strong>{scoreTicketFiltered.length}</strong> de {filteredRows.length} linha(s) após presets.
        </p>
      ) : null}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong> (▼ em <strong>score</strong>).
        Métricas numéricas fazem primeiro clique maior→menor; nome, categoria, sub e loja A→Z;         <strong>PDP</strong>, <strong>link</strong> e{" "}
        <strong>Ações</strong> não se ordenam. O menu <strong>▾</strong> nas colunas filtra com lista de valores (tipo Excel) sobre as linhas
        que ainda passam pelo painel de cima.{" "}
        <span style={{ opacity: 0.85 }}>Arraste a borda entre colunas nos cabeçalhos para ajustar a largura.</span>{" "}
        <span style={{ opacity: 0.88, display: "block", marginTop: "0.25rem" }}>
          <strong>Workspace:</strong> clique na linha (excepto nome já-link, PDP, Exportar ou link TikTok) para abrir <code>/produto/…</code>.
        </span>
      </p>
      {filtersScoreExcelActive && scoreTicketFiltered.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>
          Filtros de coluna ▾: <strong>{scoreExcelFiltered.length}</strong> de {scoreTicketFiltered.length} linha
          {scoreTicketFiltered.length !== 1 ? "s" : ""} após presets e Ticket.
        </p>
      ) : null}
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
      {filteredRows.length === 0 ? (
        <p style={{ opacity: 0.88 }}>Nenhum produto corresponde aos filtros actuais — ajuste os limites ou clique em Limpar.</p>
      ) : scoreExcelFiltered.length === 0 ? (
        <p style={{ opacity: 0.88 }}>
          Nenhuma linha com os filtros ▾ do cabeçalho.{" "}
          <button type="button" className="tk-btn-soft" onClick={() => setScoreExcelColFilters({ ...SCORE_EXCEL_FILTERS_INITIAL })}>
            Limpar filtros de coluna
          </button>
        </p>
      ) : (
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh
              label="score"
              colKey="score"
              filterMode="range"
              rangeMinKey="scoreMin"
              rangeMaxKey="scoreMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }}
              resizeColIdx={1}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="classificação"
              colKey="classific"
              filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={2}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="nome"
              colKey="nome"
              filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={3}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="categoria"
              colKey="categoriaPrincipal"
              filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={4}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="sub"
              colKey="subcategoria"
              filterMode="category"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={5}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="loja"
              colKey="loja"
              filterMode="text"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={6}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="preço"
              colKey="preco"
              filterMode="range"
              rangeMinKey="precoMin"
              rangeMaxKey="precoMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={7}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ticket"
              title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto"
              resizeColIdx={8}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="vendas"
              colKey="vendas"
              filterMode="range"
              rangeMinKey="vendasMin"
              rangeMaxKey="vendasMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={9}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="rating"
              colKey="rating"
              filterMode="range"
              rangeMinKey="ratingMin"
              rangeMaxKey="ratingMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={10}
              onGrip={colW.onGripMouseDown}
            />
            <ExcelSortTh
              label="delta"
              colKey="delta"
              filterMode="range"
              rangeMinKey="deltaMin"
              rangeMaxKey="deltaMax"
              sortKey={sort.key}
              sortDir={sort.dir}
              onSortLabel={onSort}
              colFilters={scoreExcelColFilters}
              setColFilters={setScoreExcelColFilters}
              menuOpenKey={scoreExcelMenuKey}
              setMenuOpenKey={setScoreExcelMenuKey}
              onApplySort={onScoreExcelApplySort}
              datasetRows={scoreTicketFiltered}
              rowMatches={scoreExcelRowMatchesColFilters}
              quickSortShortcut={null}
              resizeColIdx={11}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="PDP"
              title="Enriquecer PDP no servidor (npm run pdp:enrich)"
              resizeColIdx={12}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh
              label="Ações"
              title="Exportar ao DigitalOcean Spaces"
              resizeColIdx={13}
              onGrip={colW.onGripMouseDown}
            />
            <PlainTh label="link" resizeColIdx={14} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pidStr = String(row.productId ?? "").trim();
            return (
            <tr
              key={`${row.productId}-${i}`}
              style={{
                borderBottom: "1px solid var(--tk-border)",
                cursor: pidStr ? "pointer" : "default"
              }}
              title={pidStr ? "Clique na linha para abrir o workspace (excepto link / Exportar / Enriquecer PDP)" : undefined}
              onClick={(e) => {
                if (!pidStr) return;
                if (isInteractiveTableCellClick(e)) return;
                void navigate(`/produto/${encodeURIComponent(pidStr)}`);
              }}
            >
              <td style={tdPosStyle}>{i + 1}</td>
              <td>{row.score}</td>
              <td>{row.classific}</td>
              <td style={{ verticalAlign: "middle" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                <Link
                  to={`/produto/${encodeURIComponent(row.productId)}`}
                  title="Abrir página de trabalho deste produto"
                  style={{ color: "var(--tk-accent)", textDecoration: "none", fontWeight: 500 }}
                >
                  {row.nome}
                </Link>
                  <ProductLabelsChips row={/** @type {Record<string, unknown>} */ (row)} />
                </div>
              </td>
              <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
                {catCellPt(row.categoriaPrincipal)}
              </td>
              <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
                {catCellPt(row.subcategoria)}
              </td>
              <td>{row.loja}</td>
              <td>{row.preco ?? "—"}</td>
              <TicketBadgeCell row={/** @type {Record<string, unknown>} */ (row)} />
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
            );
          })}
        </tbody>
      </table>
      )}
    </>
  );
}

const GROWTH_EMPTY_MSG =
  "Ainda não há dados suficientes para calcular crescimento. Rode pelo menos duas coletas/importações comparáveis.";

/** @param {{ data: Record<string, unknown> | null }} props */
function TableGrowth({ data }) {
  const navigate = useNavigate();
  const allRows = asArray(data?.items);
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

  const growthRowsTicket = useMemo(
    () =>
      allRows.filter((r) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (r))
      ),
    [allRows, ticketTier]
  );

  const growthIntro = (
    <IntroCard title="Em Ascensão">
      <p style={introLead}>
        <strong>Variação de vendas</strong> entre o <strong>último</strong> e o <strong>penúltimo</strong> import na base — o
        servidor compara pares de snapshots com vendas registadas e ordena por maior <strong>delta</strong> (sem recalcular no
        browser). Vista global ou filtrada por <code>categoryUrl</code> na API.
      </p>
      <p style={{ ...introLead, marginTop: "0.35rem", fontSize: "0.82rem", opacity: 0.9 }}>
        <strong>Workspace:</strong> clique em qualquer ponto da linha (excepto o link «abrir» TikTok) para abrir{" "}
        <code>/produto/…</code> quando houver <code>productId</code>.
      </p>
      <div style={introWarn}>
        Métricas derivadas dos imports — não são números em tempo real do TikTok.
      </div>
    </IntroCard>
  );

  if (data == null) {
    return (
      <>
        {growthIntro}
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }

  if (allRows.length === 0) {
    return (
      <>
        {growthIntro}
        <p style={{ opacity: 0.9, marginBottom: "0.45rem", maxWidth: "42rem", lineHeight: 1.5 }}>{GROWTH_EMPTY_MSG}</p>
        {data.message ? (
          <p style={{ fontSize: "0.8rem", opacity: 0.72, maxWidth: "42rem" }}>{String(data.message)}</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      {growthIntro}
      {data.latestRun && data.previousRun ? (
        <p style={{ fontSize: "0.74rem", opacity: 0.78, marginBottom: "0.5rem" }}>
          Runs: último <code>{String((/** @type {Record<string, unknown>} */ (data.latestRun)).id ?? "")}</code> vs anterior{" "}
          <code>{String((/** @type {Record<string, unknown>} */ (data.previousRun)).id ?? "")}</code>
          {data.sortNote ? (
            <>
              {" "}
              · {String(data.sortNote)}
            </>
          ) : null}
        </p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Após filtro Ticket: <strong>{growthRowsTicket.length}</strong> de {allRows.length} linha(s).
        </p>
      ) : null}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--tk-border)", textAlign: "left" }}>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>#</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>nome</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>loja</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>preço</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>Ticket</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>vendas ant.</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>vendas atual</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>delta</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>% cresc.</th>
            <th style={{ padding: "0.4rem 0.45rem", fontWeight: 600 }}>link</th>
          </tr>
        </thead>
        <tbody>
          {growthRowsTicket.map((raw, i) => {
            const row = /** @type {Record<string, unknown>} */ (raw);
            const preco = row.preco;
            const precoStr =
              preco != null && Number.isFinite(Number(preco))
                ? Number(preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : preco != null && String(preco).trim() !== ""
                  ? String(preco)
                  : "—";
            const link = row.link != null ? String(row.link) : "";
            const key = row.productId != null ? String(row.productId) : link || `g-${i}`;
            const pid = row.productId != null ? String(row.productId).trim() : "";
            return (
              <tr
                key={key}
                style={{
                  borderBottom: "1px solid var(--tk-border)",
                  cursor: pid ? "pointer" : "default"
                }}
                title={pid ? "Clique na linha para abrir o workspace deste produto" : undefined}
                onClick={(e) => {
                  if (isInteractiveTableCellClick(e)) return;
                  if (!pid) return;
                  void navigate(`/produto/${encodeURIComponent(pid)}`);
                }}
              >
                <td style={{ padding: "0.35rem 0.45rem", opacity: 0.85 }}>{i + 1}</td>
                <td style={{ padding: "0.35rem 0.45rem", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                    <span>{row.nome != null ? String(row.nome) : "—"}</span>
                    <ProductLabelsChips row={row} />
                  </div>
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{row.loja != null ? String(row.loja) : "—"}</td>
                <td style={{ padding: "0.35rem 0.45rem" }}>{precoStr}</td>
                <TicketBadgeCell row={row} tdExtra={{ padding: "0.35rem 0.45rem" }} />
                <td style={{ padding: "0.35rem 0.45rem" }}>
                  {row.vendasAnt != null ? Number(row.vendasAnt).toLocaleString("pt-BR") : "—"}
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>
                  {row.vendasAtual != null ? Number(row.vendasAtual).toLocaleString("pt-BR") : "—"}
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>
                  {row.delta != null ? Number(row.delta).toLocaleString("pt-BR") : "—"}
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>
                  {row.deltaPct != null && String(row.deltaPct).trim() !== "" ? String(row.deltaPct) : "—"}
                </td>
                <td style={{ padding: "0.35rem 0.45rem" }}>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer">
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

function TableCategoryMap({ data }) {
  const navigate = useNavigate();
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
      <p style={{ margin: "0.55rem 0 0", lineHeight: 1.55, fontSize: "0.82rem", opacity: 0.9 }}>
        A <strong>primeira tabela</strong> (pastas / subcategorias) é <strong>só agregação</strong> — não há um produto por linha, por isso{" "}
        <strong>não</strong> abre workspace ao clicar. Na segunda tabela (<strong>SKU em destaque</strong>), cada linha é um produto: clique na linha (excepto{" "}
        <strong>Exportar</strong> ou link TikTok) para abrir <code>/produto/…</code>.
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

  const [mapSubColFilters, setMapSubColFilters] = useState(() => ({ ...MAP_SUB_FILTERS_INITIAL }));
  const [mapTopColFilters, setMapTopColFilters] = useState(() => ({ ...MAP_TOP_FILTERS_INITIAL }));
  const [mapSubMenuKey, setMapSubMenuKey] = useState(/** @type {string | null} */ (null));
  const [mapTopMenuKey, setMapTopMenuKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    setMapSubColFilters({ ...MAP_SUB_FILTERS_INITIAL });
    setMapTopColFilters({ ...MAP_TOP_FILTERS_INITIAL });
    setMapSubMenuKey(null);
    setMapTopMenuKey(null);
  }, [data?.scrapeRun?.id]);

  const [sortSub, setSortSub] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));
  const [sortTop, setSortTop] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const flatSubFiltered = useMemo(
    () =>
      flatSubcats.filter((r) =>
        mapSubRowMatchesColFilters(/** @type {Record<string, unknown>} */ (r), mapSubColFilters)
      ),
    [flatSubcats, mapSubColFilters]
  );

  const flatTopFiltered = useMemo(
    () =>
      flatTops.filter((r) => mapTopRowMatchesColFilters(/** @type {Record<string, unknown>} */ (r), mapTopColFilters)),
    [flatTops, mapTopColFilters]
  );

  const mapSubFiltersExcelActive = useMemo(() => mapSubAnyColumnFiltersExcelActive(mapSubColFilters), [mapSubColFilters]);
  const mapTopFiltersExcelActive = useMemo(() => mapTopAnyColumnFiltersExcelActive(mapTopColFilters), [mapTopColFilters]);

  const sortedSubcats = useMemo(() => {
    if (flatSubFiltered.length === 0) return [];
    return sortMapSubcatsByColumn(flatSubFiltered, sortSub.key, sortSub.dir);
  }, [flatSubFiltered, sortSub]);

  const sortedTops = useMemo(() => {
    if (flatTopFiltered.length === 0) return [];
    return sortMapTopProductsByColumn(flatTopFiltered, sortTop.key, sortTop.dir);
  }, [flatTopFiltered, sortTop]);

  const onSortSub = useCallback((k) => {
    setSortSub((s) => toggleSort(s.key, s.dir, k, SORT_MAP_SUB_DESC));
  }, []);

  const onSortTop = useCallback((k) => {
    setSortTop((s) => toggleSort(s.key, s.dir, k, SORT_MAP_TOP_DESC));
  }, []);

  const onMapSubApplySort = useCallback((key, dir) => {
    setSortSub({ key, dir });
    setMapSubMenuKey(null);
  }, []);

  const onMapTopApplySort = useCallback((key, dir) => {
    setSortTop({ key, dir });
    setMapTopMenuKey(null);
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
      {mapSubFiltersExcelActive && flatSubcats.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.45rem" }}>
          Filtros ▾ (tabela subcategorias): <strong>{flatSubFiltered.length}</strong> de {flatSubcats.length} linha(s).
        </p>
      ) : null}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: "1.35rem" }}>
        <colgroup>{colWSub.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh
              label="mestre"
              colKey="masterName"
              filterMode="text"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:masterName"
              quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }}
              resizeColIdx={1}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="categoria · ID"
              colKey="subName"
              filterMode="text"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:subName"
              quickSortShortcut={null}
              resizeColIdx={2}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="score"
              colKey="score"
              filterMode="range"
              rangeMinKey="scoreMin"
              rangeMaxKey="scoreMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:score"
              quickSortShortcut={null}
              resizeColIdx={3}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="classificação"
              colKey="classification"
              filterMode="text"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:classification"
              quickSortShortcut={null}
              resizeColIdx={4}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="produtos"
              colKey="totalProducts"
              filterMode="range"
              rangeMinKey="totalProductsMin"
              rangeMaxKey="totalProductsMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:totalProducts"
              quickSortShortcut={null}
              resizeColIdx={5}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="vendas (Σ)"
              colKey="totalSales"
              filterMode="range"
              rangeMinKey="totalSalesMin"
              rangeMaxKey="totalSalesMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:totalSales"
              quickSortShortcut={null}
              resizeColIdx={6}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="rating méd."
              colKey="avgRating"
              filterMode="range"
              rangeMinKey="avgRatingMin"
              rangeMaxKey="avgRatingMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:avgRating"
              quickSortShortcut={null}
              resizeColIdx={7}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="preço méd."
              colKey="avgPrice"
              filterMode="range"
              rangeMinKey="avgPriceMin"
              rangeMaxKey="avgPriceMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:avgPrice"
              quickSortShortcut={null}
              resizeColIdx={8}
              onGrip={colWSub.onGripMouseDown}
            />
            <ExcelSortTh
              label="oport."
              colKey="opportunities"
              filterMode="range"
              rangeMinKey="opportunitiesMin"
              rangeMaxKey="opportunitiesMax"
              sortKey={sortSub.key}
              sortDir={sortSub.dir}
              onSortLabel={onSortSub}
              colFilters={mapSubColFilters}
              setColFilters={setMapSubColFilters}
              menuOpenKey={mapSubMenuKey}
              setMenuOpenKey={setMapSubMenuKey}
              onApplySort={onMapSubApplySort}
              datasetRows={flatSubcats}
              rowMatches={mapSubRowMatchesColFilters}
              menuHeaderId="sub:opportunities"
              quickSortShortcut={null}
              resizeColIdx={9}
              onGrip={colWSub.onGripMouseDown}
            />
          </tr>
        </thead>
        <tbody>
          {sortedSubcats.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ ...tdStyle, padding: "0.75rem 0.45rem" }}>
                Nenhuma linha com os filtros ▾ actuais.{" "}
                <button type="button" className="tk-btn-soft" onClick={() => setMapSubColFilters({ ...MAP_SUB_FILTERS_INITIAL })}>
                  Limpar filtros desta tabela
                </button>
              </td>
            </tr>
          ) : (
            sortedSubcats.map((row, idx) => {
            const { mestre, categoria } = mapCategoryTableLabelsPt(row.masterName, row.subName);
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
          })
          )}
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
        <span style={{ opacity: 0.88, display: "block", marginTop: "0.25rem" }}>
          <strong>Workspace:</strong> clique na linha (excepto export ou link «abrir») quando existir <code>productId</code>.
        </span>
      </p>
      {mapTopFiltersExcelActive && flatTops.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.45rem" }}>
          Filtros ▾ (SKU destacados): <strong>{flatTopFiltered.length}</strong> de {flatTops.length} linha(s).
        </p>
      ) : null}
      {exportFeedback ? <SpacesExportFeedback feedback={exportFeedback} /> : null}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colWTop.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh
              label="mestre"
              colKey="masterName"
              filterMode="text"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:masterName"
              quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }}
              resizeColIdx={1}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="categoria · ID"
              colKey="subName"
              filterMode="text"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:subName"
              quickSortShortcut={null}
              resizeColIdx={2}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="nome"
              colKey="nome"
              filterMode="text"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:nome"
              quickSortShortcut={null}
              resizeColIdx={3}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="cat. SKU"
              colKey="categoriaPrincipal"
              filterMode="category"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:categoriaPrincipal"
              quickSortShortcut={null}
              resizeColIdx={4}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="sub SKU"
              colKey="subcategoria"
              filterMode="category"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:subcategoria"
              quickSortShortcut={null}
              resizeColIdx={5}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="score"
              colKey="score"
              filterMode="range"
              rangeMinKey="scoreMin"
              rangeMaxKey="scoreMax"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:score"
              quickSortShortcut={null}
              resizeColIdx={6}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="vendas"
              colKey="vendas"
              filterMode="range"
              rangeMinKey="vendasMin"
              rangeMaxKey="vendasMax"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:vendas"
              quickSortShortcut={null}
              resizeColIdx={7}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="rating"
              colKey="rating"
              filterMode="range"
              rangeMinKey="ratingMin"
              rangeMaxKey="ratingMax"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:rating"
              quickSortShortcut={null}
              resizeColIdx={8}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="preço"
              colKey="preco"
              filterMode="range"
              rangeMinKey="precoMin"
              rangeMaxKey="precoMax"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:preco"
              quickSortShortcut={null}
              resizeColIdx={9}
              onGrip={colWTop.onGripMouseDown}
            />
            <ExcelSortTh
              label="Δ vendas"
              colKey="delta"
              filterMode="range"
              rangeMinKey="deltaMin"
              rangeMaxKey="deltaMax"
              sortKey={sortTop.key}
              sortDir={sortTop.dir}
              onSortLabel={onSortTop}
              colFilters={mapTopColFilters}
              setColFilters={setMapTopColFilters}
              menuOpenKey={mapTopMenuKey}
              setMenuOpenKey={setMapTopMenuKey}
              onApplySort={onMapTopApplySort}
              datasetRows={flatTops}
              rowMatches={mapTopRowMatchesColFilters}
              menuHeaderId="top:delta"
              quickSortShortcut={null}
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
          {sortedTops.length === 0 ? (
            <tr>
              <td colSpan={13} style={{ ...tdStyle, padding: "0.75rem 0.45rem" }}>
                Nenhuma linha com os filtros ▾ actuais.{" "}
                <button type="button" className="tk-btn-soft" onClick={() => setMapTopColFilters({ ...MAP_TOP_FILTERS_INITIAL })}>
                  Limpar filtros desta tabela
                </button>
              </td>
            </tr>
          ) : (
            sortedTops.map((row, i) => {
            const { mestre, categoria } = mapCategoryTableLabelsPt(row.masterName, row.subName);
            const pid = String(row.productId ?? "").trim();
            return (
              <tr
                key={row.rowKey || i}
                style={{
                  cursor: pid ? "pointer" : "default"
                }}
                title={pid ? "Clique na linha para abrir o workspace deste produto" : undefined}
                onClick={(e) => {
                  if (isInteractiveTableCellClick(e)) return;
                  if (!pid) return;
                  void navigate(`/produto/${encodeURIComponent(pid)}`);
                }}
              >
                <td style={{ ...tdStyle, ...tdPosStyle }}>{i + 1}</td>
                <td style={tdStyle}>{mestre}</td>
                <td style={tdStyle}>{categoria}</td>
                <td style={tdStyle}>{row.nome}</td>
                <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.categoriaPrincipal ?? "")}>
                  {catCellPt(row.categoriaPrincipal)}
                </td>
                <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.subcategoria ?? "")}>
                  {catCellPt(row.subcategoria)}
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
          })
          )}
        </tbody>
      </table>
    </>
  );
}

function TableScalableSections({ data }) {
  const navigate = useNavigate();
  const rawV = asArray(data?.validatedToScale);
  const rawP = asArray(data?.potentialBets);
  const colW = useColumnWidths(CW_SCALE);
  const { exportingProductId, exportFeedback, exportToSpace } = useSpacesExport();
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

  const [scaleView, setScaleView] = useState(/** @type {'validated' | 'potential'} */ ("validated"));

  const [scaleValColFilters, setScaleValColFilters] = useState(() => ({ ...SCALE_FILTERS_INITIAL }));
  const [scalePotColFilters, setScalePotColFilters] = useState(() => ({ ...SCALE_FILTERS_INITIAL }));
  const [scaleValMenuKey, setScaleValMenuKey] = useState(/** @type {string | null} */ (null));
  const [scalePotMenuKey, setScalePotMenuKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    setScaleValColFilters({ ...SCALE_FILTERS_INITIAL });
    setScalePotColFilters({ ...SCALE_FILTERS_INITIAL });
    setScaleValMenuKey(null);
    setScalePotMenuKey(null);
  }, [data?.scrapeRun?.id]);

  const [sortVal, setSortVal] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));
  const [sortPot, setSortPot] = useState(() => ({ key: "score", dir: /** @type {SortDir} */ ("desc") }));

  const rawVFiltered = useMemo(
    () =>
      rawV.filter((r) =>
        scaleRowMatchesColFilters(/** @type {Record<string, unknown>} */ (r), scaleValColFilters)
      ),
    [rawV, scaleValColFilters]
  );

  const rawPFiltered = useMemo(
    () =>
      rawP.filter((r) =>
        scaleRowMatchesColFilters(/** @type {Record<string, unknown>} */ (r), scalePotColFilters)
      ),
    [rawP, scalePotColFilters]
  );

  const rawVTicket = useMemo(
    () =>
      rawVFiltered.filter((r) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (r))
      ),
    [rawVFiltered, ticketTier]
  );

  const rawPTicket = useMemo(
    () =>
      rawPFiltered.filter((r) =>
        rowMatchesTicketFilter(ticketTier, /** @type {Record<string, unknown>} */ (r))
      ),
    [rawPFiltered, ticketTier]
  );

  const v = useMemo(() => {
    if (rawVTicket.length === 0) return [];
    return sortScalableRowsByColumn(rawVTicket, sortVal.key, sortVal.dir);
  }, [rawVTicket, sortVal]);

  const p = useMemo(() => {
    if (rawPTicket.length === 0) return [];
    return sortScalableRowsByColumn(rawPTicket, sortPot.key, sortPot.dir);
  }, [rawPTicket, sortPot]);

  const scaleValFiltersExcelActive = useMemo(
    () => scaleAnyColumnFiltersExcelActive(scaleValColFilters),
    [scaleValColFilters]
  );
  const scalePotFiltersExcelActive = useMemo(
    () => scaleAnyColumnFiltersExcelActive(scalePotColFilters),
    [scalePotColFilters]
  );

  const onSortV = useCallback((k) => {
    setSortVal((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC));
  }, []);

  const onSortP = useCallback((k) => {
    setSortPot((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC));
  }, []);

  const onScaleValApplySort = useCallback((key, dir) => {
    setSortVal({ key, dir });
    setScaleValMenuKey(null);
  }, []);

  const onScalePotApplySort = useCallback((key, dir) => {
    setSortPot({ key, dir });
    setScalePotMenuKey(null);
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
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55, fontSize: "0.82rem", opacity: 0.9 }}>
        <strong>Workspace:</strong> em cada lista abaixo, clique na linha (excepto <strong>Exportar</strong> ou link «abrir») para abrir{" "}
        <code>/produto/…</code>.
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
    list.map((row, i) => {
      const pid = String(row.productId ?? "").trim();
      return (
        <tr
          key={`${row.productId}-${i}`}
          style={{
            borderBottom: "1px solid var(--tk-border)",
            cursor: pid ? "pointer" : "default"
          }}
          title={pid ? "Clique na linha para abrir o workspace deste produto" : undefined}
          onClick={(e) => {
            if (isInteractiveTableCellClick(e)) return;
            if (!pid) return;
            void navigate(`/produto/${encodeURIComponent(pid)}`);
          }}
        >
          <td style={tdPosStyle}>{i + 1}</td>
          <td>{row.nome}</td>
          <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>
            {catCellPt(row.categoriaPrincipal)}
          </td>
          <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>
            {catCellPt(row.subcategoria)}
          </td>
          <td>{row.score}</td>
          <td>{row.vendas ?? "—"}</td>
          <td>{row.rating ?? "—"}</td>
          <TicketBadgeCell row={/** @type {Record<string, unknown>} */ (row)} tdExtra={{ padding: "0.35rem 0.45rem" }} />
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
      );
    });

  return (
    <>
      {escalarIntro}
      {escalarOrdemP}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && (rawV.length > 0 || rawP.length > 0) ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Filtro Ticket aplica-se às duas listas carregadas (Validados: <strong>{rawVTicket.length}</strong> de{" "}
          {rawVFiltered.length} após ▾ · Potencial: <strong>{rawPTicket.length}</strong> de {rawPFiltered.length} após ▾).
        </p>
      ) : null}
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
            <>
              {scaleValFiltersExcelActive && rawV.length > 0 ? (
                <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>
                  Filtros ▾ nesta lista: <strong>{rawVFiltered.length}</strong> de {rawV.length} linha(s).
                </p>
              ) : null}
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <colgroup>{colW.colElements}</colgroup>
              <thead>
                <tr>
                  <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
                  <ExcelSortTh
                    label="nome"
                    colKey="nome"
                    filterMode="text"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:nome"
                    quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }}
                    resizeColIdx={1}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="categoria"
                    colKey="categoriaPrincipal"
                    filterMode="category"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:categoriaPrincipal"
                    quickSortShortcut={null}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="sub"
                    colKey="subcategoria"
                    filterMode="category"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:subcategoria"
                    quickSortShortcut={null}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="score"
                    colKey="score"
                    filterMode="range"
                    rangeMinKey="scoreMin"
                    rangeMaxKey="scoreMax"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:score"
                    quickSortShortcut={null}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="vendas"
                    colKey="vendas"
                    filterMode="range"
                    rangeMinKey="vendasMin"
                    rangeMaxKey="vendasMax"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:vendas"
                    quickSortShortcut={null}
                    resizeColIdx={5}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="rating"
                    colKey="rating"
                    filterMode="range"
                    rangeMinKey="ratingMin"
                    rangeMaxKey="ratingMax"
                    sortKey={sortVal.key}
                    sortDir={sortVal.dir}
                    onSortLabel={onSortV}
                    colFilters={scaleValColFilters}
                    setColFilters={setScaleValColFilters}
                    menuOpenKey={scaleValMenuKey}
                    setMenuOpenKey={setScaleValMenuKey}
                    onApplySort={onScaleValApplySort}
                    datasetRows={rawV}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="val:rating"
                    quickSortShortcut={null}
                    resizeColIdx={6}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh
                    label="Ticket"
                    title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto"
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
                {v.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "0.65rem 0.5rem", fontSize: "0.82rem", opacity: 0.9 }}>
                      Nenhuma linha com os filtros ▾.{" "}
                      <button type="button" className="tk-btn-soft" onClick={() => setScaleValColFilters({ ...SCALE_FILTERS_INITIAL })}>
                        Limpar filtros desta lista
                      </button>
                    </td>
                  </tr>
                ) : (
                  renderRows(v)
                )}
              </tbody>
            </table>
            </>
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
            <>
              {scalePotFiltersExcelActive && rawP.length > 0 ? (
                <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>
                  Filtros ▾ nesta lista: <strong>{rawPFiltered.length}</strong> de {rawP.length} linha(s).
                </p>
              ) : null}
            <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <colgroup>{colW.colElements}</colgroup>
              <thead>
                <tr>
                  <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
                  <ExcelSortTh
                    label="nome"
                    colKey="nome"
                    filterMode="text"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:nome"
                    quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }}
                    resizeColIdx={1}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="categoria"
                    colKey="categoriaPrincipal"
                    filterMode="category"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:categoriaPrincipal"
                    quickSortShortcut={null}
                    resizeColIdx={2}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="sub"
                    colKey="subcategoria"
                    filterMode="category"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:subcategoria"
                    quickSortShortcut={null}
                    resizeColIdx={3}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="score"
                    colKey="score"
                    filterMode="range"
                    rangeMinKey="scoreMin"
                    rangeMaxKey="scoreMax"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:score"
                    quickSortShortcut={null}
                    resizeColIdx={4}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="vendas"
                    colKey="vendas"
                    filterMode="range"
                    rangeMinKey="vendasMin"
                    rangeMaxKey="vendasMax"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:vendas"
                    quickSortShortcut={null}
                    resizeColIdx={5}
                    onGrip={colW.onGripMouseDown}
                  />
                  <ExcelSortTh
                    label="rating"
                    colKey="rating"
                    filterMode="range"
                    rangeMinKey="ratingMin"
                    rangeMaxKey="ratingMax"
                    sortKey={sortPot.key}
                    sortDir={sortPot.dir}
                    onSortLabel={onSortP}
                    colFilters={scalePotColFilters}
                    setColFilters={setScalePotColFilters}
                    menuOpenKey={scalePotMenuKey}
                    setMenuOpenKey={setScalePotMenuKey}
                    onApplySort={onScalePotApplySort}
                    datasetRows={rawP}
                    rowMatches={scaleRowMatchesColFilters}
                    menuHeaderId="pot:rating"
                    quickSortShortcut={null}
                    resizeColIdx={6}
                    onGrip={colW.onGripMouseDown}
                  />
                  <PlainTh
                    label="Ticket"
                    title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto"
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
                {p.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "0.65rem 0.5rem", fontSize: "0.82rem", opacity: 0.9 }}>
                      Nenhuma linha com os filtros ▾.{" "}
                      <button type="button" className="tk-btn-soft" onClick={() => setScalePotColFilters({ ...SCALE_FILTERS_INITIAL })}>
                        Limpar filtros desta lista
                      </button>
                    </td>
                  </tr>
                ) : (
                  renderRows(p)
                )}
              </tbody>
            </table>
            </>
          )}
        </section>
      )}
    </>
  );
}

/** Atalhos só de UI: mudam aba, `mode` da API (Opportunities) e filtro Ticket partilhado — sem novos endpoints. */
const CREATOR_PRESETS = [
  {
    id: "starter",
    emoji: "🔥",
    label: "Creator Starter",
    tabId: "opp",
    opportunityMode: "low_sales",
    ticket: "medio"
  },
  { id: "momentum", emoji: "📈", label: "Momentum", tabId: "growth", ticket: "medio_alto" },
  {
    id: "gems",
    emoji: "💎",
    label: "Hidden Gems",
    tabId: "opp",
    opportunityMode: "below_median",
    ticket: "medio"
  },
  { id: "test", emoji: "🧪", label: "Produtos para Teste", tabId: "score", ticket: "baixo_medio" },
  { id: "tickethigh", emoji: "💰", label: "Ticket Alto", tabId: "score", ticket: "alto" }
];

export function AnalyticsDashboard({ variant = "global", pageTitle, categoryBread }) {
  const {
    tab,
    setTab,
    cache,
    loading,
    error,
    load,
    tabs,
    setError,
    setOpportunityMode,
    setTicketTier
  } = useAnalyticsDashboardCache();

  const applyCreatorPreset = useCallback(
    /** @param {(typeof CREATOR_PRESETS)[number]} p */
    (p) => {
      setError(null);
      setTab(p.tabId);
      if ("opportunityMode" in p && p.opportunityMode != null) {
        setOpportunityMode(p.opportunityMode);
      }
      setTicketTier(p.ticket);
    },
    [setTab, setOpportunityMode, setTicketTier, setError]
  );

  const current = tabs.find((t) => t.id === tab);

  const data = current ? cache[current.key] : null;

  const heading = pageTitle ?? "Analytics (API)";

  const categoryBreadDisplay = useMemo(
    () => (categoryBread ? localizeCategoryBread(categoryBread) : null),
    [categoryBread]
  );

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
      {variant === "category" && categoryBread && categoryBreadDisplay ? (
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
            <strong>{categoryBreadDisplay.masterCategory}</strong>
          </p>
          {showSubLine ? (
            <p style={{ margin: 0, opacity: 0.92 }}>
              <span style={{ opacity: 0.7 }}>Subcategoria:</span>{" "}
              <strong>{categoryBreadDisplay.subcategory}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      {variant === "category" ? (
        <>
          <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Relatórios filtrados com <code>categoryUrl</code> na API (mesmos separadores que o painel global). O separador
            activo <strong>carrega automaticamente</strong> ao abrir esta vista ou ao mudar de separador. Use{" "}
            <strong>Carregar dados</strong> para actualizar só o separador actual a partir da API.
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
            <strong>Resumo:</strong> Top = ranque servidor só por vendas registadas (<code>sales_count</code>) no último import (ver secção Top) ·
            Opportunities = regras de “oportunidade” por modo · Product Score =
            ranking interno (0–100) · Em Ascensão = comparativo vendas último vs penúltimo run (API Growth) · Escalar = dois grupos de foco sobre tudo o que já tem score · Mapa = força das categorias nos
            dados importados.
          </p>
          <p style={{ fontSize: "0.72rem", opacity: 0.66, marginTop: "0.35rem", lineHeight: 1.45, maxWidth: "46rem" }}>
            O separador activo <strong>carrega automaticamente</strong> ao abrir o Analytics ou ao mudar de separador. Use{" "}
            <strong>Carregar dados</strong> para actualizar só o separador actual a partir da API. Ao voltar do{" "}
            <strong>workspace do produto</strong> ou de <strong>Produtos em análise</strong>, o que já estava em cache
            mantém-se na sessão até recarregar ou mudar de vista.
          </p>
        </>
      )}

      <section
        style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: "var(--tk-radius-lg)",
          border: "1px solid var(--tk-border)",
          background: "var(--tk-surface-raised)"
        }}
        aria-label="Creator Presets"
      >
        <h2 style={{ fontSize: "0.92rem", fontWeight: 600, margin: "0 0 0.55rem 0", color: "var(--tk-text)" }}>
          🎯 Creator Presets
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "stretch" }}>
          {CREATOR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyCreatorPreset(p)}
              style={{
                padding: "0.42rem 0.75rem",
                cursor: "pointer",
                borderRadius: "var(--tk-radius-md)",
                border: "1px solid var(--tk-border)",
                background: "var(--tk-surface)",
                color: "var(--tk-text)",
                fontWeight: 500,
                fontSize: "0.78rem",
                lineHeight: 1.35,
                textAlign: "left",
                boxShadow: "var(--tk-shadow-sm)"
              }}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
        <p style={{ margin: "0.55rem 0 0", fontSize: "0.72rem", opacity: 0.78, lineHeight: 1.45, maxWidth: "48rem" }}>
          Os presets apenas organizam filtros e relatórios já existentes para acelerar análise creator.
        </p>
      </section>

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
      {!loading && tab === "growth" && <TableGrowth data={data} />}
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
          <Route path="shortlist" element={<ShortlistPage />} />
          <Route path="produto/:productId" element={<ProductWorkspacePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
