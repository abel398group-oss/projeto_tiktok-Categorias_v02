/**
 * tableShared.jsx — Componentes UI e utilitários partilhados por todas as abas de analytics.
 * Extraído de App.jsx para reduzir o tamanho do ficheiro principal.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { ColumnResizeGrip } from "./useColumnWidths.jsx";
import { deriveProductLabels } from "./productLabels.js";
import { getTicketLabel, rowMatchesTicketFilter } from "./ticketLabel.js";
import { translateCategoryPathEnToPt } from "./tiktokCategoryLabelsPt.js";

export { rowMatchesTicketFilter };

// ─── Cabeçalhos de tabela ────────────────────────────────────────────────────

/** @typedef {'asc' | 'desc'} SortDir */

/**
 * Cabeçalho ordenável (▲▼ quando activo, ↕ quando inactivo).
 */
export function SortTh({ label, colKey, sortKey, sortDir, onSort, resizeColIdx, onGrip }) {
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", width: "100%", minWidth: "4.5rem" }}>
        <span style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: 0 }}>
          {label}
        </span>
        <span style={{ flex: "0 0 auto", opacity: active ? 1 : 0.42, lineHeight: 1, fontSize: "0.72rem" }} aria-hidden="true">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
      {resize ? <ColumnResizeGrip onMouseDown={onGrip(resizeColIdx)} /> : null}
    </th>
  );
}

/** Cabeçalho não ordenável (ex.: link ou # posição). */
export function PlainTh({ label, title, resizeColIdx, onGrip }) {
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
 */
export function ExcelSortTh({
  label, colKey, filterMode, rangeMinKey, rangeMaxKey,
  sortKey, sortDir, onSortLabel, colFilters, setColFilters,
  menuOpenKey, setMenuOpenKey, onApplySort, datasetRows, rowMatches,
  menuHeaderId, distinctFieldKey, quickSortShortcut = null, resizeColIdx, onGrip
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

  /**
   * A lista de valores distintos só é lida dentro do menu (`{open ? ... }`), mas
   * era calculada sempre — em TODAS as colunas, sobre o dataset INTEIRO, a cada
   * render. Com `limit=5000` no Top Products isso são ~10 colunas a varrer 5000
   * linhas e a ordenar milhares de strings; medido em 04/09/2026, cada troca
   * para o separador Top Products bloqueava o browser 9,3 s para mostrar 20
   * linhas, sem um único pedido à rede. Calcular só com o menu aberto é o mesmo
   * resultado pelo custo de quem realmente abre o filtro.
   */
  const rowsForDistinct = useMemo(
    () => (open ? datasetRows.filter((r) => rowMatches(/** @type {Record<string, unknown>} */ (r), relaxedForDistinct)) : LISTA_VAZIA),
    [open, datasetRows, relaxedForDistinct, rowMatches]
  );

  const distinctValues = useMemo(
    () => (open ? oppDistinctSortedForColumn(rowsForDistinct, dField) : LISTA_VAZIA),
    [open, rowsForDistinct, dField]
  );

  const filteredDistinct = useMemo(() => {
    const n = listNeedle.trim().toLowerCase();
    if (!n) return distinctValues;
    return distinctValues.filter((opt) => {
      const pt = filterMode === "category" ? translateCategoryPathEnToPt(opt) : opt;
      const hay = `${opt} ${pt}`.toLowerCase();
      return n.split(/\s+/).filter(Boolean).every((tok) => hay.includes(tok));
    });
  }, [distinctValues, listNeedle, filterMode]);

  useEffect(() => { if (!open) setListNeedle(""); }, [open]);

  let filterActive = false;
  if (filterMode === "text" || filterMode === "category") {
    filterActive = Array.isArray(colFilters[colKey]);
  } else if (filterMode === "range" && rangeMinKey && rangeMaxKey) {
    filterActive = String(colFilters[rangeMinKey] ?? "").trim() !== "" || String(colFilters[rangeMaxKey] ?? "").trim() !== "";
  }

  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (wrapRef.current != null && !wrapRef.current.contains(/** @type {Node} */ (e.target))) setMenuOpenKey(null);
    };
    const esc = (e) => { if (e.key === "Escape") setMenuOpenKey(null); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", esc); };
  }, [open, setMenuOpenKey]);

  const dropdownBtnStyle = {
    flex: "0 0 1.5rem", width: "1.5rem", alignSelf: "stretch",
    border: "none", borderLeft: "1px solid var(--tk-border-soft)",
    background: filterActive ? "var(--tk-accent-soft)" : "transparent",
    color: filterActive ? "var(--tk-accent)" : "var(--tk-text-muted)",
    cursor: "pointer", fontSize: "0.72rem", lineHeight: 1, padding: 0
  };

  const selRaw = colFilters[colKey];
  const sel = Array.isArray(selRaw) ? /** @type {readonly string[]} */ (selRaw) : null;
  const optionChecked = (/** @type {string} */ opt) => (sel === null ? true : sel.includes(opt));

  const toggleDistinctValue = (/** @type {string} */ opt) => {
    setColFilters((prev) => {
      const rel = excelRelaxColumnFilters(prev, colKey, filterMode, rangeMinKey, rangeMaxKey);
      const subset = datasetRows.filter((r) => rowMatches(/** @type {Record<string, unknown>} */ (r), rel));
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
    <th ref={wrapRef} scope="col" style={{ position: "relative", verticalAlign: "middle", padding: 0, paddingRight: resize ? "0.65rem" : 0, boxSizing: "border-box", overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: "2rem" }}>
        <button type="button" title="Ordenar por esta coluna" onClick={() => onSortLabel(colKey)}
          style={{ flex: "1 1 auto", minWidth: 0, textAlign: "left", cursor: "pointer", border: "none", background: "transparent", color: "var(--tk-text)", font: "inherit", padding: "0.4rem 0.3rem 0.4rem 0.5rem", borderBottom: activeSort ? "2px solid var(--tk-accent)" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.3rem" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ flex: "0 0 auto", opacity: activeSort ? 1 : 0.38, fontSize: "0.68rem" }} aria-hidden>
            {activeSort ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
        <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={`Filtro e ordenação: ${label}`}
          title="Filtro e ordenação (estilo Excel)"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenKey(open ? null : hk); }}
          style={dropdownBtnStyle}>▾</button>
      </div>
      {resize ? <ColumnResizeGrip onMouseDown={onGrip(resizeColIdx)} /> : null}
      {open ? (
        <div role="menu" style={{ position: "absolute", left: 0, top: "100%", marginTop: "1px", zIndex: 100, minWidth: "15rem", maxWidth: "min(22rem, 94vw)", padding: "0.5rem 0.55rem", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-raised)", boxShadow: "0 8px 28px rgb(0 0 0 / 0.5)" }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.88, marginBottom: "0.35rem" }}>Ordenar</div>
          {filterMode === "range" ? (
            <>
              <button type="button" className="tk-btn-soft" style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.72rem", padding: "0.32rem" }} onClick={() => onApplySort(colKey, "asc")}>Do menor para o maior</button>
              <button type="button" className="tk-btn-soft" style={{ width: "100%", marginBottom: "0.45rem", fontSize: "0.72rem", padding: "0.32rem" }} onClick={() => onApplySort(colKey, "desc")}>Do maior para o menor</button>
            </>
          ) : (
            <>
              <button type="button" className="tk-btn-soft" style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.72rem", padding: "0.32rem" }} onClick={() => onApplySort(colKey, "asc")}>De A a Z</button>
              <button type="button" className="tk-btn-soft" style={{ width: "100%", marginBottom: "0.45rem", fontSize: "0.72rem", padding: "0.32rem" }} onClick={() => onApplySort(colKey, "desc")}>De Z a A</button>
            </>
          )}
          <div style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.88, margin: "0.35rem 0" }}>Filtrar</div>
          {filterMode === "text" || filterMode === "category" ? (
            <>
              <input type="search" placeholder="Pesquisar na lista…" autoComplete="off" value={listNeedle} onChange={(e) => setListNeedle(e.target.value)} style={{ ...oppFilterInputStyle, width: "100%", maxWidth: "100%", marginBottom: "0.35rem" }} />
              <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                <button type="button" className="tk-btn-soft" style={{ fontSize: "0.68rem", padding: "0.22rem 0.4rem", flex: "1 1 auto" }} onClick={() => setColFilters((prev) => ({ ...prev, [colKey]: null }))}>Marcar todas</button>
                <button type="button" className="tk-btn-soft" style={{ fontSize: "0.68rem", padding: "0.22rem 0.4rem", flex: "1 1 auto" }} onClick={() => setColFilters((prev) => ({ ...prev, [colKey]: [] }))}>Desmarcar todas</button>
              </div>
              <div style={{ maxHeight: "11rem", overflowY: "auto", marginBottom: "0.35rem", borderRadius: "var(--tk-radius-sm)", border: "1px solid var(--tk-border-soft)", background: "var(--tk-surface-inset)", padding: "0.25rem 0.35rem" }}>
                {distinctValues.length === 0 ? (
                  <div style={{ fontSize: "0.72rem", opacity: 0.75, padding: "0.25rem 0" }}>Sem valores (outros filtros podem ter escondido todas as linhas).</div>
                ) : filteredDistinct.length === 0 ? (
                  <div style={{ fontSize: "0.72rem", opacity: 0.75, padding: "0.25rem 0" }}>Nada corresponde à pesquisa.</div>
                ) : (
                  filteredDistinct.map((opt) => {
                    const display = filterMode === "category" ? translateCategoryPathEnToPt(opt) : opt;
                    return (
                      <label key={opt} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.72rem", lineHeight: 1.35, padding: "0.2rem 0", cursor: "pointer", color: "var(--tk-text)" }}>
                        <input type="checkbox" checked={optionChecked(opt)} onChange={() => toggleDistinctValue(opt)} style={{ marginTop: "0.12rem", flex: "0 0 auto" }} />
                        <span style={{ wordBreak: "break-word", minWidth: 0 }} title={filterMode === "category" ? opt : undefined}>{display}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.35rem" }}>
              <input type="text" inputMode="decimal" placeholder="Mín." aria-label={`${label} mínimo`} value={colFilters[rangeMinKey] ?? ""} onChange={(e) => setColFilters((prev) => ({ ...prev, [rangeMinKey]: e.target.value }))} style={{ ...oppFilterInputStyle, flex: 1, width: "auto", minWidth: 0 }} />
              <span style={{ opacity: 0.5, fontSize: "0.7rem" }}>—</span>
              <input type="text" inputMode="decimal" placeholder="Máx." aria-label={`${label} máximo`} value={colFilters[rangeMaxKey] ?? ""} onChange={(e) => setColFilters((prev) => ({ ...prev, [rangeMaxKey]: e.target.value }))} style={{ ...oppFilterInputStyle, flex: 1, width: "auto", minWidth: 0 }} />
            </div>
          )}
          <button type="button" className="tk-btn-soft" style={{ width: "100%", fontSize: "0.7rem", padding: "0.28rem", marginBottom: "0.35rem" }} onClick={() => {
            if (filterMode === "range" && rangeMinKey && rangeMaxKey) setColFilters((prev) => ({ ...prev, [rangeMinKey]: "", [rangeMaxKey]: "" }));
            else setColFilters((prev) => ({ ...prev, [colKey]: null }));
          }}>Limpar filtro desta coluna</button>
          {quickSortShortcut ? (
            <button type="button" style={{ width: "100%", fontSize: "0.68rem", padding: "0.28rem", cursor: "pointer", border: "1px dashed var(--tk-border)", borderRadius: "var(--tk-radius-sm)", background: "var(--tk-surface-inset)", color: "var(--tk-text-muted)" }} onClick={() => onApplySort(quickSortShortcut.key, quickSortShortcut.dir)}>
              {quickSortShortcut.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </th>
  );
}

/** Cabeçalho Excel na aba Opportunities — atalho rápido ordena por rating médio. */
export function OppExcelSortTh(props) {
  return (
    <ExcelSortTh {...props} rowMatches={oppRowMatchesColFilters} quickSortShortcut={{ key: "avalMed", dir: "desc", label: "Ordenação da lista (rating ↓)" }} />
  );
}

// ─── Estilos partilhados ─────────────────────────────────────────────────────

export const positionThTitle = "Posição na ordenação actual (1, 2, 3…)";

export const tdPosStyle = {
  textAlign: "right", padding: "0.35rem 0.65rem", width: "2.65rem",
  fontVariantNumeric: "tabular-nums", opacity: 0.9
};
export const tdEllipsis = {
  maxWidth: "14rem", overflow: "hidden", textOverflow: "ellipsis",
  whiteSpace: "nowrap", verticalAlign: "middle"
};
export const oppFilterInputStyle = {
  width: "5.25rem", minWidth: "3.75rem", padding: "0.32rem 0.4rem", fontSize: "0.76rem",
  borderRadius: "var(--tk-radius-sm)", border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)", color: "var(--tk-text)", boxSizing: "border-box"
};
export const introWarn = {
  margin: "0.55rem 0 0", padding: "0.5rem 0.65rem", fontSize: "0.78rem", lineHeight: 1.45,
  borderRadius: "var(--tk-radius-sm)", borderLeft: "3px solid var(--tk-warning-edge)",
  background: "var(--tk-warning-bg)", color: "var(--tk-text)", opacity: 0.93
};
export const introBullet = { margin: "0 0 0.6rem", paddingLeft: "1.15rem", lineHeight: 1.55 };
export const introLead = { margin: "0 0 0.55rem", lineHeight: 1.55 };
export const introLabel = { margin: "0 0 0.3rem", fontSize: "0.82rem", fontWeight: 600, opacity: 0.95 };
export const introLogicBox = {
  margin: "0.55rem 0 0", padding: "0.5rem 0.65rem", fontSize: "0.76rem", lineHeight: 1.52,
  borderRadius: "var(--tk-radius-sm)", border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)", color: "var(--tk-text-muted)", opacity: 0.96
};
export const introLogicUl = { margin: "0.35rem 0 0", paddingLeft: "1.05rem", lineHeight: 1.5 };
export const introLogicLabel = { margin: "0 0 0.15rem", fontSize: "0.79rem", fontWeight: 600, opacity: 0.92, letterSpacing: "0.01em" };

// ─── Componentes de badge / label ────────────────────────────────────────────

const productLabelsChipWrap = { display: "flex", flexWrap: "wrap", gap: "0.28rem", marginTop: "0.22rem", alignItems: "center", maxWidth: "100%" };
const productLabelChipStyle = { fontSize: "0.62rem", lineHeight: 1.35, padding: "0.12rem 0.42rem", borderRadius: "var(--tk-radius-sm)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-inset)", color: "var(--tk-text-muted)", fontWeight: 500, whiteSpace: "nowrap", opacity: 0.9 };

export function ProductLabelsChips({ row }) {
  const labels = deriveProductLabels(row);
  if (!labels.length) return null;
  const titleStr = labels.map((l) => `${l.emoji} ${l.label}`).join(", ");
  return (
    <span style={productLabelsChipWrap} title={titleStr} aria-label={titleStr}>
      {labels.map((l) => (
        <span key={l.id} style={productLabelChipStyle}><span aria-hidden>{l.emoji}</span>&nbsp;{l.label}</span>
      ))}
    </span>
  );
}

export const TICKET_TIER_BADGE = {
  baixo: { background: "rgb(220 252 231 / 0.65)", borderColor: "rgb(134 239 172 / 0.55)", color: "rgb(20 83 45)" },
  medio: { background: "rgb(254 249 195 / 0.75)", borderColor: "rgb(250 204 21 / 0.45)", color: "rgb(113 63 18)" },
  alto: { background: "rgb(254 226 226 / 0.65)", borderColor: "rgb(252 165 165 / 0.55)", color: "rgb(127 29 29)" }
};

export const TICKET_FILTER_OPTIONS = /** @type {const} */ ([
  { id: "all", label: "Todos" },
  { id: "alto", label: "Ticket alto" },
  { id: "medio", label: "Ticket médio" },
  { id: "baixo", label: "Ticket baixo" },
  { id: "medio_alto", label: "Médio+Alto" },
  { id: "baixo_medio", label: "Baixo+Médio" }
]);

export function TicketFilterBar({ value, onChange }) {
  return (
    <div role="group" aria-label="Filtro rápido por faixa de preço (lista já carregada nesta vista)" style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem", alignItems: "center", marginBottom: "0.55rem" }}>
      <span style={{ fontSize: "0.74rem", opacity: 0.78, fontWeight: 600, marginRight: "0.2rem" }}>Ticket:</span>
      {TICKET_FILTER_OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button key={opt.id} type="button" onClick={() => onChange(/** @type {any} */ (opt.id))} style={{ padding: "0.32rem 0.62rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: active ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)", background: active ? "var(--tk-accent-soft)" : "var(--tk-surface)", color: "var(--tk-text)", fontWeight: active ? 600 : 500, fontSize: "0.76rem" }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TicketBadgeCell({ row, tdExtra = {} }) {
  const t = getTicketLabel(row);
  if (!t.tier) {
    return <td style={{ fontSize: "0.74rem", verticalAlign: "middle", color: "var(--tk-text-muted)", ...tdExtra }} title={t.label}>—</td>;
  }
  const st = TICKET_TIER_BADGE[t.tier];
  return (
    <td style={{ fontSize: "0.74rem", verticalAlign: "middle", ...tdExtra }} title={t.label}>
      <span style={{ display: "inline-block", padding: "0.1rem 0.42rem", borderRadius: "var(--tk-radius-sm)", border: `1px solid ${st.borderColor}`, background: st.background, color: st.color, fontWeight: 600, fontSize: "0.72rem" }}>
        {t.shortLabel}
      </span>
    </td>
  );
}

export function HoverHelpTooltip({ ariaLabel, children }) {
  return (
    <span className="tk-help-hover">
      <button type="button" className="tk-help-hover__btn" aria-label={ariaLabel} tabIndex={0}>?</button>
      <div className="tk-help-hover__panel" role="tooltip">{children}</div>
    </span>
  );
}

export function IntroCard({ title, titleAside, children }) {
  return (
    <section style={{ marginBottom: "1rem", padding: "1rem 1.15rem", borderRadius: "var(--tk-radius-lg)", border: "1px solid var(--tk-border)", background: "var(--tk-surface)", boxShadow: "var(--tk-shadow-sm)" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.55rem 0", letterSpacing: "-0.02em", color: "var(--tk-text)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
        <span>{title}</span>
        {titleAside != null ? titleAside : null}
      </h2>
      <div style={{ fontSize: "0.8rem", color: "var(--tk-text-muted)", lineHeight: 1.58 }}>{children}</div>
    </section>
  );
}

// ─── Constantes de sort e larguras de coluna ─────────────────────────────────

export function toggleSort(prevKey, prevDir, newKey, descPreferredKeys = ["score"]) {
  if (newKey === prevKey) {
    return { key: prevKey, dir: prevDir === "asc" ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc") };
  }
  const dir = descPreferredKeys.includes(newKey) ? /** @type {SortDir} */ ("desc") : /** @type {SortDir} */ ("asc");
  return { key: newKey, dir };
}

export const SORT_TOP_DESC = ["vendas", "preco", "rating"];
export const SORT_OPP_DESC = ["avalMed", "vendas", "preco"];
export const SORT_SCORE_DESC = ["score", "preco", "vendas", "delta", "rating"];
export const SORT_SCALE_DESC = ["score", "vendas", "rating"];
export const SORT_MAP_SUB_DESC = ["score", "totalSales", "avgRating", "avgPrice", "totalProducts", "opportunities"];
export const SORT_MAP_TOP_DESC = ["score", "vendas", "rating", "preco", "delta"];

export const CW_TOP    = [52, 168, 86, 86, 100, 64, 54, 72, 76, 80, 74, 72];
export const CW_OPP    = [52, 148, 76, 76, 90, 60, 52, 66, 70, 72, 78, 72, 58];
export const CW_SCORE  = [52, 56, 96, 128, 72, 72, 100, 50, 64, 70, 68, 66, 82, 86, 60];
export const CW_MAP_SUB = [52, 120, 200, 64, 120, 80, 90, 80, 80, 76];
export const CW_MAP_TOP = [48, 92, 138, 138, 76, 76, 52, 68, 62, 62, 52, 82, 56];
export const CW_SCALE  = [48, 124, 70, 70, 50, 64, 66, 52, 68, 66, 50];

export const TOP_PRODUCTS_VISIBLE_DEFAULT = 20;
export const OPPORTUNITIES_VISIBLE_DEFAULT = 20;

/**
 * "SKU em destaque", no Mapa — a única tabela do painel que desenhava tudo.
 *
 * São 1007 linhas (medido em 04/09/2026), e cada uma traz 13 células, um botão
 * `SendToAnalysisButton` e um link externo. Abrir a aba bloqueava o browser
 * ~1,7 s só a construir esse DOM, com os dados já em cache — era o último
 * custo de cliente que restava no painel. As outras tabelas já mostravam 20
 * linhas com "Ver mais"; esta passa a fazer o mesmo.
 *
 * Não muda o que os filtros e a ordenação veem: continuam a correr sobre a
 * lista inteira, e só o corte de visualização é que é aplicado no fim.
 */
export const MAP_TOP_VISIBLE_DEFAULT = 20;

export const OPP_MODE_OPTIONS = /** @type {const} */ ([
  { id: "classic", label: "Clássico", description: "Produtos com bom rating, avaliações mínimas e vendas em faixa de oportunidade.", titleTip: "API: mode=classic — faixa de vendas com sinais de qualidade (ver docs)." },
  { id: "low_sales", label: "Pouca venda", description: "Produtos com poucas vendas, mas sinais positivos de avaliação.", titleTip: "API: mode=low_sales — volume de vendas reduzido na regra do servidor." },
  { id: "no_sales", label: "Sem vendas", description: "Produtos com vendas 0 ou ausentes. Não exige avaliações, porque produtos sem venda normalmente ainda não têm reviews.", titleTip: "API: mode=no_sales — preço definido; vendas 0 ou nulas; sem mínimo de rating/reviews (ver docs/ANALYTICS.md)." },
  { id: "below_median", label: "Abaixo da mediana", description: "Produtos abaixo da mediana de vendas da categoria, mas com bons sinais.", titleTip: "API: mode=below_median — abaixo da mediana de vendas da categoria (servidor)." }
]);

// ─── Estado inicial dos filtros ───────────────────────────────────────────────

export const OPP_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria", "loja", "motivo"]);
export const OPP_COL_FILTERS_INITIAL = { nome: null, categoriaPrincipal: null, subcategoria: null, loja: null, motivo: null, precoMin: "", precoMax: "", vendasMin: "", vendasMax: "", avalMedMin: "", avalMedMax: "" };

export const TOP_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria", "loja"]);
export const TOP_FILTERS_INITIAL = { nome: null, categoriaPrincipal: null, subcategoria: null, loja: null, precoMin: "", precoMax: "", vendasMin: "", vendasMax: "", ratingMin: "", ratingMax: "" };

export const SCORE_COL_TEXT_KEYS = /** @type {const} */ (["classific", "nome", "categoriaPrincipal", "subcategoria", "loja"]);
export const SCORE_EXCEL_FILTERS_INITIAL = { classific: null, nome: null, categoriaPrincipal: null, subcategoria: null, loja: null, scoreMin: "", scoreMax: "", precoMin: "", precoMax: "", vendasMin: "", vendasMax: "", ratingMin: "", ratingMax: "", deltaMin: "", deltaMax: "" };

export const MAP_SUB_COL_TEXT_KEYS = /** @type {const} */ (["masterName", "subName", "classification"]);
export const MAP_SUB_FILTERS_INITIAL = { masterName: null, subName: null, classification: null, scoreMin: "", scoreMax: "", totalProductsMin: "", totalProductsMax: "", totalSalesMin: "", totalSalesMax: "", avgRatingMin: "", avgRatingMax: "", avgPriceMin: "", avgPriceMax: "", opportunitiesMin: "", opportunitiesMax: "" };

export const MAP_TOP_COL_TEXT_KEYS = /** @type {const} */ (["masterName", "subName", "nome", "categoriaPrincipal", "subcategoria"]);
export const MAP_TOP_FILTERS_INITIAL = { masterName: null, subName: null, nome: null, categoriaPrincipal: null, subcategoria: null, scoreMin: "", scoreMax: "", vendasMin: "", vendasMax: "", ratingMin: "", ratingMax: "", precoMin: "", precoMax: "", deltaMin: "", deltaMax: "" };

export const SCALE_COL_TEXT_KEYS = /** @type {const} */ (["nome", "categoriaPrincipal", "subcategoria"]);
export const SCALE_FILTERS_INITIAL = { nome: null, categoriaPrincipal: null, subcategoria: null, scoreMin: "", scoreMax: "", vendasMin: "", vendasMax: "", ratingMin: "", ratingMax: "" };

// ─── Funções de filtro Excel ──────────────────────────────────────────────────

export function excelRelaxColumnFilters(f, omitColKey, omitMode, rkMin, rkMax) {
  const o = { ...f };
  if (omitMode === "text" || omitMode === "category") { o[omitColKey] = null; }
  else if (omitMode === "range" && rkMin && rkMax) { o[rkMin] = ""; o[rkMax] = ""; }
  return o;
}

/**
 * Um só Collator para todas as ordenações.
 *
 * `a.localeCompare(b, "pt-BR", {...})` constrói as regras de comparação a cada
 * par comparado. Numa coluna como `nome`, com milhares de valores distintos,
 * isso são dezenas de milhares de construções para uma ordenação só.
 */
/** Mesma referência sempre: um `[]` novo a cada render invalidaria os `useMemo` a jusante. */
const LISTA_VAZIA = [];

const COLLATOR_PT = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function oppDistinctSortedForColumn(rows, columnKey) {
  const set = new Set();
  for (const row of rows) { const v = String(row[columnKey] ?? "").trim(); if (v) set.add(v); }
  return [...set].sort(COLLATOR_PT.compare);
}

export function oppMatchTextAllowlist(cellRaw, allow) {
  if (allow == null) return true;
  return allow.includes(String(cellRaw ?? "").trim());
}

export function oppNumericCell(cell) {
  if (cell == null || cell === "") return NaN;
  const n = Number(String(cell).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function oppParseBoundInput(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function boundOk(val, rawMin, rawMax) {
  const mn = oppParseBoundInput(rawMin);
  const mx = oppParseBoundInput(rawMax);
  if (mn != null && (Number.isNaN(val) || val < mn)) return false;
  if (mx != null && (Number.isNaN(val) || val > mx)) return false;
  return true;
}

export function excelColumnFiltersSomeActive(f, textKeys, rangePairs) {
  for (let i = 0; i < textKeys.length; i++) { if (Array.isArray(f[textKeys[i]])) return true; }
  for (let i = 0; i < rangePairs.length; i++) {
    const [a, b] = rangePairs[i];
    if (String(f[a] ?? "").trim() !== "" || String(f[b] ?? "").trim() !== "") return true;
  }
  return false;
}

export function oppRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal)) return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja)) return false;
  if (!oppMatchTextAllowlist(row.motivo, f.motivo)) return false;
  if (!boundOk(oppNumericCell(row.preco), f.precoMin, f.precoMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;
  if (!boundOk(oppNumericCell(row.avalMed), f.avalMedMin, f.avalMedMax)) return false;
  return true;
}

export function oppAnyOppColumnFiltersActive(f) {
  return excelColumnFiltersSomeActive(f, [...OPP_COL_TEXT_KEYS], [["precoMin", "precoMax"], ["vendasMin", "vendasMax"], ["avalMedMin", "avalMedMax"]]);
}

export function topRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal)) return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja)) return false;
  if (!boundOk(oppNumericCell(row.preco), f.precoMin, f.precoMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;
  if (!boundOk(oppNumericCell(row.avaliacao), f.ratingMin, f.ratingMax)) return false;
  return true;
}

export function topAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...TOP_COL_TEXT_KEYS], [["precoMin", "precoMax"], ["vendasMin", "vendasMax"], ["ratingMin", "ratingMax"]]);
}

export function scoreExcelRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.classific, f.classific)) return false;
  if (!oppMatchTextAllowlist(row.nome, f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal)) return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria)) return false;
  if (!oppMatchTextAllowlist(row.loja, f.loja)) return false;
  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.preco), f.precoMin, f.precoMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;
  const rat = row.rating != null ? oppNumericCell(row.rating) : NaN;
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;
  const dn = typeof row.deltaVendas === "string" ? oppNumericCell(row.deltaVendas) : oppNumericCell(row.deltaVendas);
  if (!boundOk(dn, f.deltaMin, f.deltaMax)) return false;
  return true;
}

export function scoreExcelAnyColumnFiltersActive(f) {
  return excelColumnFiltersSomeActive(f, [...SCORE_COL_TEXT_KEYS], [["scoreMin", "scoreMax"], ["precoMin", "precoMax"], ["vendasMin", "vendasMax"], ["ratingMin", "ratingMax"], ["deltaMin", "deltaMax"]]);
}

export function mapSubRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.masterName, f.masterName)) return false;
  if (!oppMatchTextAllowlist(row.subName, f.subName)) return false;
  if (!oppMatchTextAllowlist(row.classification, f.classification)) return false;
  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.totalProducts), f.totalProductsMin, f.totalProductsMax)) return false;
  if (!boundOk(oppNumericCell(row.totalSales), f.totalSalesMin, f.totalSalesMax)) return false;
  if (!boundOk(oppNumericCell(row.avgRating), f.avgRatingMin, f.avgRatingMax)) return false;
  if (!boundOk(oppNumericCell(row.avgPrice), f.avgPriceMin, f.avgPriceMax)) return false;
  if (!boundOk(oppNumericCell(row.opportunities), f.opportunitiesMin, f.opportunitiesMax)) return false;
  return true;
}

export function mapSubAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...MAP_SUB_COL_TEXT_KEYS], [["scoreMin", "scoreMax"], ["totalProductsMin", "totalProductsMax"], ["totalSalesMin", "totalSalesMax"], ["avgRatingMin", "avgRatingMax"], ["avgPriceMin", "avgPriceMax"], ["opportunitiesMin", "opportunitiesMax"]]);
}

export function mapTopRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.masterName, f.masterName)) return false;
  if (!oppMatchTextAllowlist(row.subName, f.subName)) return false;
  if (!oppMatchTextAllowlist(row.nome, f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal)) return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria)) return false;
  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;
  const rat = row.rating != null ? oppNumericCell(row.rating) : NaN;
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;
  if (!boundOk(oppNumericCell(row.preco), f.precoMin, f.precoMax)) return false;
  if (!boundOk(oppNumericCell(row.delta), f.deltaMin, f.deltaMax)) return false;
  return true;
}

export function mapTopAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...MAP_TOP_COL_TEXT_KEYS], [["scoreMin", "scoreMax"], ["vendasMin", "vendasMax"], ["ratingMin", "ratingMax"], ["precoMin", "precoMax"], ["deltaMin", "deltaMax"]]);
}

export function scaleRowMatchesColFilters(row, f) {
  if (!oppMatchTextAllowlist(row.nome, f.nome)) return false;
  if (!oppMatchTextAllowlist(row.categoriaPrincipal, f.categoriaPrincipal)) return false;
  if (!oppMatchTextAllowlist(row.subcategoria, f.subcategoria)) return false;
  if (!boundOk(oppNumericCell(row.score), f.scoreMin, f.scoreMax)) return false;
  if (!boundOk(oppNumericCell(row.vendas), f.vendasMin, f.vendasMax)) return false;
  const rat = row.rating != null ? oppNumericCell(row.rating) : NaN;
  if (!boundOk(rat, f.ratingMin, f.ratingMax)) return false;
  return true;
}

export function scaleAnyColumnFiltersExcelActive(f) {
  return excelColumnFiltersSomeActive(f, [...SCALE_COL_TEXT_KEYS], [["scoreMin", "scoreMax"], ["vendasMin", "vendasMax"], ["ratingMin", "ratingMax"]]);
}

// ─── Utilitários de célula ────────────────────────────────────────────────────

export function asArray(x) { return Array.isArray(x) ? x : []; }

export function isInteractiveTableCellClick(ev) {
  const el = ev.target;
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest("a, button, input, select, textarea, label, summary, details, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [data-no-row-click='true']"));
}

export function catCellPt(v) {
  if (v == null || String(v).trim() === "") return "—";
  return translateCategoryPathEnToPt(String(v));
}
