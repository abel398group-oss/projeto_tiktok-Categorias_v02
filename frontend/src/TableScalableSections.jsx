/**
 * TableScalableSections.jsx — Aba "Escalar" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import { useColumnWidths } from "./useColumnWidths.jsx";
import { sortScalableRowsByColumn } from "./sortUtils.js";
import { rowMatchesTicketFilter } from "./ticketLabel.js";
import SendToAnalysisButton from "./SendToAnalysisButton.jsx";
import {
  PlainTh, ExcelSortTh, TicketFilterBar, TicketBadgeCell, ProductLabelsChips,
  IntroCard, HoverHelpTooltip, positionThTitle, tdPosStyle, tdEllipsis,
  introLead, introLabel, introBullet, introLogicBox, introLogicLabel, introLogicUl, introWarn,
  toggleSort, asArray, isInteractiveTableCellClick, catCellPt,
  CW_SCALE, SORT_SCALE_DESC,
  SCALE_FILTERS_INITIAL, scaleRowMatchesColFilters, scaleAnyColumnFiltersExcelActive
} from "./tableShared.jsx";

export default function TableScalableSections({ data }) {
  const navigate = useNavigate();
  const colW = useColumnWidths(CW_SCALE);
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

  const [scaleView, setScaleView] = useState(/** @type {"validated" | "potential"} */ ("validated"));
  const [scaleValColFilters, setScaleValColFilters] = useState(() => ({ ...SCALE_FILTERS_INITIAL }));
  const [scalePotColFilters, setScalePotColFilters] = useState(() => ({ ...SCALE_FILTERS_INITIAL }));
  const [scaleValMenuKey, setScaleValMenuKey] = useState(/** @type {string | null} */ (null));
  const [scalePotMenuKey, setScalePotMenuKey] = useState(/** @type {string | null} */ (null));
  const [sortVal, setSortVal] = useState(() => ({ key: "score", dir: /** @type {"asc"|"desc"} */ ("desc") }));
  const [sortPot, setSortPot] = useState(() => ({ key: "score", dir: /** @type {"asc"|"desc"} */ ("desc") }));

  useEffect(() => {
    setScaleValColFilters({ ...SCALE_FILTERS_INITIAL });
    setScalePotColFilters({ ...SCALE_FILTERS_INITIAL });
    setScaleValMenuKey(null);
    setScalePotMenuKey(null);
  }, [data?.scrapeRun?.id]);

  const onSortV = useCallback((k) => { setSortVal((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC)); }, []);
  const onSortP = useCallback((k) => { setSortPot((s) => toggleSort(s.key, s.dir, k, SORT_SCALE_DESC)); }, []);
  const onScaleValApplySort = useCallback((key, dir) => { setSortVal({ key, dir }); setScaleValMenuKey(null); }, []);
  const onScalePotApplySort = useCallback((key, dir) => { setSortPot({ key, dir }); setScalePotMenuKey(null); }, []);

  const rawV = asArray(data?.validated);
  const rawP = asArray(data?.potential);

  const rawVFiltered = useMemo(() => rawV.filter((r) => scaleRowMatchesColFilters(/** @type {any} */ (r), scaleValColFilters)), [rawV, scaleValColFilters]);
  const rawPFiltered = useMemo(() => rawP.filter((r) => scaleRowMatchesColFilters(/** @type {any} */ (r), scalePotColFilters)), [rawP, scalePotColFilters]);
  const rawVTicket = useMemo(() => rawVFiltered.filter((r) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (r))), [rawVFiltered, ticketTier]);
  const rawPTicket = useMemo(() => rawPFiltered.filter((r) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (r))), [rawPFiltered, ticketTier]);
  const v = useMemo(() => rawVTicket.length === 0 ? [] : sortScalableRowsByColumn(rawVTicket, sortVal.key, sortVal.dir), [rawVTicket, sortVal]);
  const p = useMemo(() => rawPTicket.length === 0 ? [] : sortScalableRowsByColumn(rawPTicket, sortPot.key, sortPot.dir), [rawPTicket, sortPot]);

  const scaleValFiltersExcelActive = useMemo(() => scaleAnyColumnFiltersExcelActive(scaleValColFilters), [scaleValColFilters]);
  const scalePotFiltersExcelActive = useMemo(() => scaleAnyColumnFiltersExcelActive(scalePotColFilters), [scalePotColFilters]);

  const pill = (active) => ({
    padding: "0.38rem 0.72rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)",
    border: active ? "1px solid var(--tk-accent-ring)" : "1px solid var(--tk-border)",
    background: active ? "var(--tk-accent-soft)" : "var(--tk-surface)",
    color: "var(--tk-text)", fontWeight: active ? 600 : 500, fontSize: "0.8rem"
  });

  const escalarHoverHelp = (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontWeight: 600, color: "var(--tk-text)" }}>Critérios de elegibilidade</p>
      <p style={{ margin: "0 0 0.32rem", color: "var(--tk-text-muted)", lineHeight: 1.45, fontSize: "0.78rem" }}>
        <strong style={{ color: "var(--tk-text)" }}>Validados:</strong> vendas 300–3000, avaliação ≥ 4,3, score ≥ 55, preço presente.
      </p>
      <p style={{ margin: 0, color: "var(--tk-text-muted)", lineHeight: 1.45, fontSize: "0.78rem" }}>
        <strong style={{ color: "var(--tk-text)" }}>Apostas:</strong> vendas 10–300, avaliação ≥ 4,5, mín. 5 avaliações, score ≥ 45.
      </p>
    </div>
  );

  const escalarIntro = (
    <IntroCard title="Escalar" titleAside={<HoverHelpTooltip ariaLabel="Critérios de elegibilidade Escalar">{escalarHoverHelp}</HoverHelpTooltip>}>
      <p style={introLead}>
        <strong>Dois grupos focados</strong> para decisão de escalar. Todos os cálculos são feitos no browser sobre os dados já carregados.
      </p>
      <div style={introLabel}>Grupos disponíveis</div>
      <ul style={introBullet}>
        <li><strong>Validados para escalar:</strong> volume de vendas demonstrado (300–3000), boa avaliação e score alto.</li>
        <li><strong>Apostas com potencial:</strong> ainda em crescimento (10–300 vendas), mas com rating e score positivos.</li>
      </ul>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Calculado no browser (sobre os dados já carregados)</div>
        <ul style={introLogicUl}>
          <li>filtra a lista do Product Score pelas regras dos dois grupos — não é um endpoint separado.</li>
          <li>Clique na linha (excepto Exportar / TikTok) para abrir o workspace quando houver <code>productId</code>.</li>
        </ul>
      </div>
      <div style={introWarn}>⚠️ Critérios definidos internamente — não é garantia de lucro ou desempenho futuro.</div>
    </IntroCard>
  );

  const escalarOrdemP = (
    <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.65rem" }}>
      <strong>Ordem inicial:</strong> score ↓. Menu <strong>▾</strong> nas colunas ordena e filtra localmente. Resize na beira dos cabeçalhos.
    </p>
  );

  const renderRows = (list) =>
    list.map((row, i) => {
      const pid = String(row.productId ?? "").trim();
      return (
        <tr key={`${row.productId}-${i}`}
          className={pid ? "tk-row-clickable" : undefined}
          style={{ borderBottom: "1px solid var(--tk-border)", cursor: pid ? "pointer" : "default" }}
          title={pid ? "Clique na linha para abrir o workspace" : undefined}
          onClick={(e) => { if (isInteractiveTableCellClick(e) || !pid) return; void navigate(`/produto/${encodeURIComponent(pid)}`); }}>
          <td style={tdPosStyle}>{i + 1}</td>
          <td style={{ verticalAlign: "middle" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
              <span>{row.nome ?? "—"}</span>
              <ProductLabelsChips row={/** @type {any} */ (row)} />
            </div>
          </td>
          <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>{catCellPt(row.categoriaPrincipal)}</td>
          <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>{catCellPt(row.subcategoria)}</td>
          <td><span className="tk-metric">{row.score}</span></td>
          <td><span className="tk-metric">{row.vendas ?? "—"}</span></td>
          <td><span className="tk-metric">{row.rating ?? "—"}</span></td>
          <TicketBadgeCell row={/** @type {any} */ (row)} tdExtra={{ padding: "0.35rem 0.45rem" }} />
          <td style={{ verticalAlign: "top", padding: "0.35rem 0.3rem", overflow: "visible" }}>
            {pid ? (<SendToAnalysisButton productId={pid} nome={typeof row.nome === "string" ? row.nome : undefined} tiktokUrl={typeof row.link === "string" ? row.link : undefined} className="tk-btn-primary" />) : "—"}
          </td>
          <td>{row.link ? (<a href={row.link} target="_blank" rel="noopener noreferrer" className="tk-link-external">Abrir no TikTok</a>) : "—"}</td>
        </tr>
      );
    });

  const sharedThead = (filters, setFilters, menuKey, setMenuKey, sort, onSort, onApplySort, dataRows) => (
    <thead>
      <tr>
        <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="nome" colKey="nome" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }} resizeColIdx={1} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="categoria" colKey="categoriaPrincipal" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={2} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="sub" colKey="subcategoria" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={3} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="score" colKey="score" filterMode="range" rangeMinKey="scoreMin" rangeMaxKey="scoreMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={4} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="vendas" colKey="vendas" filterMode="range" rangeMinKey="vendasMin" rangeMaxKey="vendasMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={5} onGrip={colW.onGripMouseDown} />
        <ExcelSortTh label="rating" colKey="rating" filterMode="range" rangeMinKey="ratingMin" rangeMaxKey="ratingMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={filters} setColFilters={setFilters} menuOpenKey={menuKey} setMenuOpenKey={setMenuKey} onApplySort={onApplySort} datasetRows={dataRows} rowMatches={scaleRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={6} onGrip={colW.onGripMouseDown} />
        <PlainTh label="Ticket" title="Faixa de preço só no browser" resizeColIdx={7} onGrip={colW.onGripMouseDown} />
        <PlainTh label="Ações" title="Exportar ao DigitalOcean Spaces" resizeColIdx={8} onGrip={colW.onGripMouseDown} />
        <PlainTh label="link" resizeColIdx={9} onGrip={colW.onGripMouseDown} />
      </tr>
    </thead>
  );

  if (data == null) return (<>{escalarIntro}<p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima.</p></>);
  if (data?.message && rawV.length === 0 && rawP.length === 0) return (<>{escalarIntro}<p style={{ opacity: 0.85 }}>{data.message}</p></>);

  return (
    <>
      {escalarIntro}
      {escalarOrdemP}
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && (rawV.length > 0 || rawP.length > 0) ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>
          Filtro Ticket: Validados <strong>{rawVTicket.length}</strong> de {rawVFiltered.length} após ▾ · Potencial <strong>{rawPTicket.length}</strong> de {rawPFiltered.length} após ▾.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" style={pill(scaleView === "validated")} onClick={() => setScaleView("validated")}>1 · Validados para escalar ({rawV.length})</button>
        <button type="button" style={pill(scaleView === "potential")} onClick={() => setScaleView("potential")}>2 · Apostas com potencial ({rawP.length})</button>
      </div>

      {scaleView === "validated" && (
        <section style={{ padding: "0 0 1rem 0" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>Validados para escalar</h3>
          <p style={{ fontSize: "0.8rem", opacity: 0.88, margin: "0 0 1rem 0", lineHeight: 1.55, maxWidth: "58rem" }}>
            Produtos já com <strong>volume de vendas demonstrado</strong> (<strong>300 a 3&nbsp;000</strong> unidades),{" "}
            <strong>avaliação média ≥ 4,3</strong>, <strong>score ≥ 55</strong> e <strong>preço válido</strong>.
          </p>
          {rawV.length === 0 ? (
            <p style={{ opacity: 0.85 }}>Nenhum produto satisfaz as regras de &quot;validados&quot;.</p>
          ) : (
            <>
              {scaleValFiltersExcelActive && rawV.length > 0 ? (<p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Filtros ▾: <strong>{rawVFiltered.length}</strong> de {rawV.length} linha(s).</p>) : null}
              <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                <colgroup>{colW.colElements}</colgroup>
                {sharedThead(scaleValColFilters, setScaleValColFilters, scaleValMenuKey, setScaleValMenuKey, sortVal, onSortV, onScaleValApplySort, rawV)}
                <tbody>
                  {v.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: "0.65rem 0.5rem", fontSize: "0.82rem", opacity: 0.9 }}>Nenhuma linha com os filtros ▾.{" "}<button type="button" className="tk-btn-soft" onClick={() => setScaleValColFilters({ ...SCALE_FILTERS_INITIAL })}>Limpar</button></td></tr>
                  ) : renderRows(v)}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {scaleView === "potential" && (
        <section style={{ padding: "0 0 1rem 0" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>Apostas com potencial</h3>
          <p style={{ fontSize: "0.8rem", opacity: 0.88, margin: "0 0 1rem 0", lineHeight: 1.55, maxWidth: "58rem" }}>
            SKUs com <strong>vendas ainda típicas de arranque</strong> (<strong>10 a 300</strong>), mas com{" "}
            <strong>rating alto</strong> (média <strong>≥ 4,5</strong>, pelo menos <strong>5 avaliações</strong>) e <strong>score ≥ 45</strong>.
          </p>
          {rawP.length === 0 ? (
            <p style={{ opacity: 0.85 }}>Nenhum produto satisfaz as regras de &quot;apostas&quot;.</p>
          ) : (
            <>
              {scalePotFiltersExcelActive && rawP.length > 0 ? (<p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Filtros ▾: <strong>{rawPFiltered.length}</strong> de {rawP.length} linha(s).</p>) : null}
              <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                <colgroup>{colW.colElements}</colgroup>
                {sharedThead(scalePotColFilters, setScalePotColFilters, scalePotMenuKey, setScalePotMenuKey, sortPot, onSortP, onScalePotApplySort, rawP)}
                <tbody>
                  {p.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: "0.65rem 0.5rem", fontSize: "0.82rem", opacity: 0.9 }}>Nenhuma linha com os filtros ▾.{" "}<button type="button" className="tk-btn-soft" onClick={() => setScalePotColFilters({ ...SCALE_FILTERS_INITIAL })}>Limpar</button></td></tr>
                  ) : renderRows(p)}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </>
  );
}
