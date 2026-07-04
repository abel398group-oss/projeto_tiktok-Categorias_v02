/**
 * TableOpp.jsx — Aba "Opportunities" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAnalyticsDashboardCache, OPPORTUNITIES_UI_FETCH_LIMIT } from "./analyticsDashboardCache.jsx";
import { useColumnWidths } from "./useColumnWidths.jsx";
import { sortOppItemsByColumn } from "./sortUtils.js";
import { rowMatchesTicketFilter } from "./ticketLabel.js";
import SendToAnalysisButton from "./SendToAnalysisButton.jsx";
import {
  PlainTh, OppExcelSortTh, TicketFilterBar, TicketBadgeCell, ProductLabelsChips,
  IntroCard, HoverHelpTooltip, positionThTitle, tdPosStyle, tdEllipsis, introLead,
  toggleSort, asArray, isInteractiveTableCellClick, catCellPt,
  CW_OPP, OPPORTUNITIES_VISIBLE_DEFAULT, SORT_OPP_DESC, OPP_MODE_OPTIONS,
  OPP_COL_FILTERS_INITIAL, oppRowMatchesColFilters, oppAnyOppColumnFiltersActive
} from "./tableShared.jsx";

export default function TableOpp({ data }) {
  const navigate = useNavigate();
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_OPP);
  const { opportunityMode, setOpportunityMode, ticketTier, setTicketTier } = useAnalyticsDashboardCache();
  const [expanded, setExpanded] = useState(false);
  const [oppColFilters, setOppColFilters] = useState(() => ({ ...OPP_COL_FILTERS_INITIAL }));
  const [oppMenuKey, setOppMenuKey] = useState(/** @type {string | null} */ (null));
  const [sort, setSort] = useState(() => ({ key: "avalMed", dir: /** @type {"asc"|"desc"} */ ("desc") }));

  useEffect(() => {
    setExpanded(false);
    setOppColFilters({ ...OPP_COL_FILTERS_INITIAL });
    setOppMenuKey(null);
  }, [data?.scrapeRun?.id, opportunityMode]);

  const activeOppMode = OPP_MODE_OPTIONS.find((o) => o.id === opportunityMode) ?? OPP_MODE_OPTIONS[0];

  const oppModeToolbar = (
    <div role="radiogroup" aria-label="Modo do relatório Opportunities" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.45rem", alignItems: "center" }}>
      <span style={{ fontSize: "0.76rem", opacity: 0.78, marginRight: "0.25rem", fontWeight: 600 }}>Modo de análise:</span>
      {OPP_MODE_OPTIONS.map(({ id, label, description, titleTip }) => (
        <button key={id} type="button" role="radio" aria-checked={opportunityMode === id} aria-label={`${label}. ${description}`} title={titleTip} onClick={() => setOpportunityMode(id)}
          style={{ padding: "0.36rem 0.65rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: opportunityMode === id ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)", background: opportunityMode === id ? "var(--tk-accent-soft)" : "var(--tk-surface)", color: "var(--tk-text)", fontWeight: opportunityMode === id ? 600 : 500, fontSize: "0.78rem", boxShadow: opportunityMode === id ? "var(--tk-shadow-sm)" : "none" }}>
          {label}
        </button>
      ))}
    </div>
  );

  const oppModeDescriptionBlock = (
    <div role="status" aria-live="polite" style={{ marginBottom: "0.6rem", maxWidth: "48rem", padding: "0.55rem 0.72rem", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-raised)", fontSize: "0.82rem", lineHeight: 1.55, color: "var(--tk-text)" }}>
      <strong>{activeOppMode.label}</strong>
      <span style={{ opacity: 0.45, margin: "0 0.35rem" }}>—</span>
      <span style={{ color: "var(--tk-text-muted)" }}>{activeOppMode.description}</span>
    </div>
  );

  const oppHoverHelpBody = (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontWeight: 600, color: "var(--tk-text)" }}>Resumo</p>
      <p style={{ margin: 0, color: "var(--tk-text-muted)", lineHeight: 1.45 }}>
        Último import na base (ou por categoria na vista filtrada). Cada <strong style={{ color: "var(--tk-text)" }}>modo</strong> chama{" "}
        <code style={{ fontSize: "0.74rem" }}>/analytics/opportunities?mode=…</code>; o significado operacional está no texto sob os botões.
      </p>
      <p style={{ margin: "0.45rem 0 0", color: "var(--tk-text-muted)", lineHeight: 1.45 }}>
        Tabela: clique no cabeçalho ordena · <strong>▾</strong> filtra · nome ou <strong>linha inteira</strong> abre o workspace · <strong>Ações</strong> exporta.
      </p>
    </div>
  );

  const oppIntro = (
    <IntroCard title="Opportunities" titleAside={<HoverHelpTooltip ariaLabel="Resumo do relatório Opportunities">{oppHoverHelpBody}</HoverHelpTooltip>}>
      <p style={{ ...introLead, marginBottom: 0 }}>
        Use os botões para alternar o <strong>modo da API</strong> · lista compacta = primeiras{" "}
        <strong>{OPPORTUNITIES_VISIBLE_DEFAULT}</strong> linhas (<strong>Ver mais</strong> até {OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")} pedidas).
      </p>
    </IntroCard>
  );

  const filteredRaw = useMemo(
    () => rawItems.filter((row) => oppRowMatchesColFilters(/** @type {any} */ (row), oppColFilters)),
    [rawItems, oppColFilters]
  );

  const oppAfterTicket = useMemo(
    () => filteredRaw.filter((row) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (row))),
    [filteredRaw, ticketTier]
  );

  const filtersActive = useMemo(() => oppAnyOppColumnFiltersActive(oppColFilters), [oppColFilters]);

  const items = useMemo(() => {
    if (oppAfterTicket.length === 0) return [];
    return sortOppItemsByColumn(oppAfterTicket, sort.key, sort.dir);
  }, [oppAfterTicket, sort]);

  const displayRows = useMemo(() => {
    if (items.length <= OPPORTUNITIES_VISIBLE_DEFAULT || expanded) return items;
    return items.slice(0, OPPORTUNITIES_VISIBLE_DEFAULT);
  }, [items, expanded]);

  const rankingTotalServer =
    typeof data?.rankingTotal === "number" && Number.isFinite(data.rankingTotal)
      ? data.rankingTotal
      : rawItems.length;
  const hasMoreLocally = items.length > OPPORTUNITIES_VISIBLE_DEFAULT;

  const onSort = useCallback((k) => { setSort((s) => toggleSort(s.key, s.dir, k, SORT_OPP_DESC)); }, []);
  const onApplySort = useCallback((key, dir) => { setSort({ key, dir }); setOppMenuKey(null); }, []);

  const ruleNote = typeof data?.ruleNote === "string" && data.ruleNote.trim() !== ""
    ? (<p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.55rem", maxWidth: "48rem", lineHeight: 1.45 }}>{data.ruleNote}</p>)
    : null;

  if (data == null) {
    return (
      <>
        {oppModeToolbar}{oppModeDescriptionBlock}{oppIntro}
        <p style={{ fontSize: "0.72rem", opacity: 0.72, marginBottom: "0.45rem" }}>Ordem inicial: rating ↓ · carregue dados acima.</p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }
  if (data?.message && rawItems.length === 0) return (<>{oppModeToolbar}{oppModeDescriptionBlock}{ruleNote}{oppIntro}<p style={{ opacity: 0.85 }}>{data.message}</p></>);
  if (rawItems.length === 0) return (<>{oppModeToolbar}{oppModeDescriptionBlock}{ruleNote}{oppIntro}<p>Sem linhas.</p></>);

  return (
    <>
      {oppModeToolbar}{oppModeDescriptionBlock}{ruleNote}{oppIntro}
      {filtersActive && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Após filtros locais: <strong>{filteredRaw.length}</strong> de {rawItems.length} linha{rawItems.length !== 1 ? "s" : ""}.</p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>Após filtro Ticket: <strong>{oppAfterTicket.length}</strong> de {filteredRaw.length} linha(s).</p>
      ) : null}
      {rankingTotalServer > OPPORTUNITIES_VISIBLE_DEFAULT ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem", lineHeight: 1.4 }}>
          <strong>{rankingTotalServer.toLocaleString("pt-BR")}</strong> candidatos
          {hasMoreLocally ? ` · até ${OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")} linhas pedidas` : null}
          {!expanded && hasMoreLocally ? ` · compacta = primeiros ${OPPORTUNITIES_VISIBLE_DEFAULT}` : null}
          .
        </p>
      ) : null}
      <>
        <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{colW.colElements}</colgroup>
          <thead>
            <tr>
              <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="nome" colKey="nome" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={1} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="categoria" colKey="categoriaPrincipal" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={2} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="sub" colKey="subcategoria" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={3} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="loja" colKey="loja" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={4} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="preço" colKey="preco" filterMode="range" rangeMinKey="precoMin" rangeMaxKey="precoMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={5} onGrip={colW.onGripMouseDown} />
              <PlainTh label="Ticket" title="Faixa de preço só no browser" resizeColIdx={6} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="vendas" colKey="vendas" filterMode="range" rangeMinKey="vendasMin" rangeMaxKey="vendasMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={7} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="rating" colKey="avalMed" filterMode="range" rangeMinKey="avalMedMin" rangeMaxKey="avalMedMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={8} onGrip={colW.onGripMouseDown} />
              <OppExcelSortTh label="motivo" colKey="motivo" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={oppColFilters} setColFilters={setOppColFilters} menuOpenKey={oppMenuKey} setMenuOpenKey={setOppMenuKey} onApplySort={onApplySort} datasetRows={rawItems} resizeColIdx={9} onGrip={colW.onGripMouseDown} />
              <PlainTh label="Ações" title="Exportar ao DigitalOcean Spaces" resizeColIdx={10} onGrip={colW.onGripMouseDown} />
              <PlainTh label="link" resizeColIdx={11} onGrip={colW.onGripMouseDown} />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: "0.75rem 0.65rem", fontSize: "0.82rem", opacity: 0.9, textAlign: "left", borderTop: "1px solid var(--tk-border-soft)" }}>
                  Nenhuma linha com os filtros actuais.{" "}
                  <button type="button" className="tk-btn-soft" onClick={() => setOppColFilters({ ...OPP_COL_FILTERS_INITIAL })}>limpar todos os filtros</button>.
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const pos = items.indexOf(row) + 1;
                const pid = row.productId;
                const hasProductId = pid != null && String(pid).trim() !== "";
                const pidStr = hasProductId ? String(pid).trim() : "";
                const nomeStr = typeof row.nome === "string" ? row.nome : row.nome != null ? String(row.nome) : "";
                return (
                  <tr key={`${row.productId}-${pos}`}
                    className={hasProductId ? "tk-row-clickable" : undefined}
                    style={{ borderBottom: "1px solid var(--tk-border)", cursor: hasProductId ? "pointer" : "default" }}
                    title={hasProductId ? "Clique na linha para abrir o workspace" : undefined}
                    onClick={(e) => { if (!hasProductId || isInteractiveTableCellClick(e)) return; void navigate(`/produto/${encodeURIComponent(pidStr)}`); }}>
                    <td style={tdPosStyle}>{pos}</td>
                    <td style={{ verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        {hasProductId ? (<Link to={`/produto/${encodeURIComponent(pidStr)}`} title={nomeStr || "Abrir workspace"} className="tk-link-workspace">{row.nome ?? "—"}</Link>) : (<span title={nomeStr || undefined}>{row.nome ?? "—"}</span>)}
                        <ProductLabelsChips row={/** @type {any} */ (row)} />
                      </div>
                    </td>
                    <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>{catCellPt(row.categoriaPrincipal)}</td>
                    <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>{catCellPt(row.subcategoria)}</td>
                    <td>{row.loja}</td>
                    <td>{row.preco ?? "—"}</td>
                    <TicketBadgeCell row={/** @type {any} */ (row)} />
                    <td><span className="tk-metric">{row.vendas ?? "—"}</span></td>
                    <td>{row.avalMed != null ? (<><span className="tk-metric">{row.avalMed}</span>{" "}<span className="tk-metric-muted">({row.avalTot ?? "—"} aval)</span></>) : "—"}</td>
                    <td>{row.motivo ?? "—"}</td>
                    <td style={{ verticalAlign: "top", padding: "0.35rem 0.3rem", overflow: "visible" }}>
                      {hasProductId ? (<SendToAnalysisButton productId={pidStr} nome={typeof row.nome === "string" ? row.nome : undefined} tiktokUrl={typeof row.link === "string" ? row.link : undefined} className="tk-btn-primary" />) : "—"}
                    </td>
                    <td>{row.link ? (<a href={row.link} target="_blank" rel="noopener noreferrer" className="tk-link-external">Abrir no TikTok</a>) : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {hasMoreLocally ? (
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" className="tk-btn-soft" onClick={() => setExpanded((ex) => !ex)}>
              {expanded ? `Mostrar só os primeiros ${OPPORTUNITIES_VISIBLE_DEFAULT}` : `Ver mais (${(items.length - OPPORTUNITIES_VISIBLE_DEFAULT).toLocaleString("pt-BR")} seguintes)`}
            </button>
          </div>
        ) : null}
      </>
      {data?.truncated === true && rankingTotalServer > rawItems.length ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.72, marginTop: "0.55rem", maxWidth: "44rem", lineHeight: 1.45 }}>
          Lista truncada: <strong>{rankingTotalServer.toLocaleString("pt-BR")}</strong>+ candidatos; pedido até <strong>{OPPORTUNITIES_UI_FETCH_LIMIT.toLocaleString("pt-BR")}</strong> linhas.
        </p>
      ) : null}
    </>
  );
}
