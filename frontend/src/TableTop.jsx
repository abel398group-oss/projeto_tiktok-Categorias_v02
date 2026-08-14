/**
 * TableTop.jsx — Aba "Top Products" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAnalyticsDashboardCache, TOP_PRODUCTS_UI_FETCH_LIMIT } from "./analyticsDashboardCache.jsx";
import { useColumnWidths } from "./useColumnWidths.jsx";
import { sortTopItemsByColumn } from "./sortUtils.js";
import { rowMatchesTicketFilter } from "./ticketLabel.js";
import SendToAnalysisButton from "./SendToAnalysisButton.jsx";
import {
  PlainTh, ExcelSortTh, TicketFilterBar, TicketBadgeCell, ProductLabelsChips,
  IntroCard, positionThTitle, tdPosStyle, tdEllipsis, introLead,
  introLogicBox, introLogicLabel, introLogicUl, introWarn,
  toggleSort, asArray, isInteractiveTableCellClick, catCellPt,
  CW_TOP, TOP_PRODUCTS_VISIBLE_DEFAULT, SORT_TOP_DESC,
  TOP_FILTERS_INITIAL, topRowMatchesColFilters, topAnyColumnFiltersExcelActive
} from "./tableShared.jsx";

export default function TableTop({ data }) {
  const navigate = useNavigate();
  const rawItems = asArray(data?.items);
  const colW = useColumnWidths(CW_TOP);
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();
  const [expanded, setExpanded] = useState(false);
  const [topColFilters, setTopColFilters] = useState(() => ({ ...TOP_FILTERS_INITIAL }));
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
        <strong>não</strong> mistura avaliação nem preço nessa ordem inicial.
      </p>
      <p style={{ ...introLead, marginTop: "0.35rem" }}>
        <strong>Origem das linhas:</strong> vista <strong>global</strong> usa snapshots do <strong>último import</strong>;
        vista <strong>por categoria</strong> filtra por <code>categoryUrl</code> na API.
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Neste painel (dados já carregados)</div>
        <ul style={introLogicUl}>
          <li>Clicar no cabeçalho ou <strong>▾</strong> altera apenas <strong>ordenação e filtros locais</strong> no browser.</li>
          <li><strong>Ações</strong> → Exportar pelo servidor. <strong>nome</strong> → workspace <code>/produto/…</code>. <strong>link</strong> → TikTok.</li>
          <li>Com <code>productId</code>, pode clicar em <strong>qualquer ponto da linha</strong> (excepto link / Exportar) para abrir o workspace.</li>
        </ul>
      </div>
      <div style={{ ...introWarn, marginTop: "0.5rem", borderLeftColor: "rgb(148 163 184 / 0.35)", background: "var(--tk-surface-inset)", fontSize: "0.76rem", padding: "0.4rem 0.55rem" }}>
        Por defeito <strong>{TOP_PRODUCTS_VISIBLE_DEFAULT}</strong> linhas · <strong>Ver mais produtos</strong> para o restante. Valores são snapshot na base (não tempo real TikTok).
      </div>
    </IntroCard>
  );

  const [sort, setSort] = useState(() => ({ key: "vendas", dir: /** @type {"asc"|"desc"} */ ("desc") }));

  const filteredRawTop = useMemo(
    () => rawItems.filter((row) => topRowMatchesColFilters(/** @type {any} */ (row), topColFilters)),
    [rawItems, topColFilters]
  );

  const topAfterTicket = useMemo(
    () => filteredRawTop.filter((row) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (row))),
    [filteredRawTop, ticketTier]
  );

  const filtersActiveTopExcel = useMemo(() => topAnyColumnFiltersExcelActive(topColFilters), [topColFilters]);

  const items = useMemo(() => {
    if (topAfterTicket.length === 0) return [];
    return sortTopItemsByColumn(topAfterTicket, sort.key, sort.dir);
  }, [topAfterTicket, sort]);

  const displayRows = useMemo(() => {
    if (items.length <= TOP_PRODUCTS_VISIBLE_DEFAULT || expanded) return items;
    return items.slice(0, TOP_PRODUCTS_VISIBLE_DEFAULT);
  }, [items, expanded]);

  const rankingTotal =
    typeof data?.rankingTotal === "number" && Number.isFinite(data.rankingTotal)
      ? data.rankingTotal
      : topAfterTicket.length;

  const onSort = useCallback((k) => { setSort((s) => toggleSort(s.key, s.dir, k, SORT_TOP_DESC)); }, []);
  const onTopApplySort = useCallback((key, dir) => { setSort({ key, dir }); setTopMenuKey(null); }, []);
  const hasMoreLocally = items.length > TOP_PRODUCTS_VISIBLE_DEFAULT;

  if (data == null) {
    return (
      <>
        {topIntro}
        <p style={{ fontSize: "0.72rem", opacity: 0.7, marginBottom: "0.45rem" }}>Carregue dados acima.</p>
        <p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima para preencher a tabela.</p>
      </>
    );
  }
  if (data?.message && rawItems.length === 0) return (<>{topIntro}<p style={{ opacity: 0.85 }}>{data.message}</p></>);
  if (rawItems.length === 0) return (<>{topIntro}<p>Sem linhas.</p></>);

  return (
    <>
      {topIntro}
      <p style={{ fontSize: "0.72rem", opacity: 0.7, marginBottom: "0.45rem" }}>Ordem inicial: <strong>vendas</strong> maior→menor (API). Resize na beira das colunas.</p>
      {filtersActiveTopExcel && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Depois dos filtros ▾: <strong>{filteredRawTop.length}</strong> de {rawItems.length} linha{rawItems.length !== 1 ? "s" : ""}.</p>
      ) : null}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && rawItems.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>Após filtro Ticket: <strong>{topAfterTicket.length}</strong> de {filteredRawTop.length} linha(s).</p>
      ) : null}
      {rankingTotal > TOP_PRODUCTS_VISIBLE_DEFAULT ? (
        <p style={{ fontSize: "0.75rem", opacity: 0.78, marginBottom: "0.55rem" }}>
          <strong>Ranking nesta corrida:</strong> {rankingTotal.toLocaleString("pt-BR")} produto{rankingTotal !== 1 ? "s" : ""} com <code>vendas</code>
          {!expanded && hasMoreLocally ? ` · compacta = primeiros ${TOP_PRODUCTS_VISIBLE_DEFAULT} pela ordenação atual.` : null}
          {(expanded || !hasMoreLocally) ? ` · A mostrar ${items.length.toLocaleString("pt-BR")} na tabela.` : null}
        </p>
      ) : null}
      <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colW.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="nome" colKey="nome" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={{ key: "vendas", dir: "desc", label: "Ordenação (vendas ↓)" }} resizeColIdx={1} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="categoria" colKey="categoriaPrincipal" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={2} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="sub" colKey="subcategoria" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={3} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="loja" colKey="loja" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={4} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="preço" colKey="preco" filterMode="range" rangeMinKey="precoMin" rangeMaxKey="precoMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={5} onGrip={colW.onGripMouseDown} />
            <PlainTh label="Ticket" title="Faixa de preço só no browser: &lt; 30 baixo · 30–79,9 médio · ≥ 80 alto" resizeColIdx={6} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="vendas" colKey="vendas" filterMode="range" rangeMinKey="vendasMin" rangeMaxKey="vendasMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={7} onGrip={colW.onGripMouseDown} />
            <ExcelSortTh label="rating" colKey="rating" filterMode="range" rangeMinKey="ratingMin" rangeMaxKey="ratingMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={topColFilters} setColFilters={setTopColFilters} menuOpenKey={topMenuKey} setMenuOpenKey={setTopMenuKey} onApplySort={onTopApplySort} datasetRows={rawItems} rowMatches={topRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={8} onGrip={colW.onGripMouseDown} />
            <PlainTh label="Ações" title="Exportar ao DigitalOcean Spaces" resizeColIdx={9} onGrip={colW.onGripMouseDown} />
            <PlainTh label="link" resizeColIdx={10} onGrip={colW.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={11} style={{ padding: "0.75rem 0.65rem", fontSize: "0.82rem", opacity: 0.9 }}>
                Nenhuma linha com os filtros ▾ actuais.{" "}
                <button type="button" className="tk-btn-soft" onClick={() => setTopColFilters({ ...TOP_FILTERS_INITIAL })}>Limpar filtros de coluna</button>
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
                      {hasProductId
                        ? (<Link to={`/produto/${encodeURIComponent(pidStr)}`} title={nomeStr || "Abrir workspace"} className="tk-link-workspace">{row.nome ?? "—"}</Link>)
                        : (<span title={nomeStr || undefined}>{row.nome ?? "—"}</span>)}
                      <ProductLabelsChips row={/** @type {any} */ (row)} />
                    </div>
                  </td>
                  <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>{catCellPt(row.categoriaPrincipal)}</td>
                  <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>{catCellPt(row.subcategoria)}</td>
                  <td style={tdEllipsis} title={typeof row.loja === "string" ? row.loja : undefined}>{row.loja ?? "—"}</td>
                  <td>{row.preco ?? "—"}</td>
                  <TicketBadgeCell row={/** @type {any} */ (row)} />
                  <td><span className="tk-metric">{row.vendas ?? "—"}</span></td>
                  <td>{typeof row.avaliacao === "number" && Number.isFinite(row.avaliacao) ? (<span className="tk-metric">{row.avaliacao.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>) : "—"}</td>
                  <td style={{ verticalAlign: "top", padding: "0.35rem 0.3rem", overflow: "visible" }}>
                    {pidStr ? (<SendToAnalysisButton productId={pidStr} nome={typeof row.nome === "string" ? row.nome : undefined} tiktokUrl={typeof row.link === "string" ? row.link : undefined} className="tk-btn-primary" />) : "—"}
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
            {expanded ? "Mostrar só os primeiros 20" : `Ver mais produtos (${(items.length - TOP_PRODUCTS_VISIBLE_DEFAULT).toLocaleString("pt-BR")} seguintes)`}
          </button>
        </div>
      ) : null}
      {data?.truncated === true && rankingTotal > items.length ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.72, marginTop: "0.55rem", maxWidth: "44rem", lineHeight: 1.45 }}>
          O servidor devolve até <strong>{TOP_PRODUCTS_UI_FETCH_LIMIT.toLocaleString("pt-BR")}</strong> linhas; nesta corrida há pelo menos <strong>{rankingTotal.toLocaleString("pt-BR")}</strong> produtos com vendas.
        </p>
      ) : null}
    </>
  );
}
