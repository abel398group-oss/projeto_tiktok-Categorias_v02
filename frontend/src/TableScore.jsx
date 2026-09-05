/**
 * TableScore.jsx — Aba "Product Score" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAnalyticsDashboardCache } from "./analyticsDashboardCache.jsx";
import { useColumnWidths } from "./useColumnWidths.jsx";
import { sortScoreRowsByColumn } from "./sortUtils.js";
import { rowMatchesTicketFilter } from "./ticketLabel.js";
import { INITIAL_FILTER_STATE, PRODUCT_SCORE_PRESETS, applyProductFilters, filtersAreInactive } from "./productFilters.js";
import SendToAnalysisButton from "./SendToAnalysisButton.jsx";
import {
  PlainTh, ExcelSortTh, TicketFilterBar, TicketBadgeCell, ProductLabelsChips,
  IntroCard, positionThTitle, tdPosStyle, tdEllipsis, introLead,
  introLogicBox, introLogicLabel, introLogicUl, introWarn,
  toggleSort, asArray, isInteractiveTableCellClick, catCellPt,
  CW_SCORE, SORT_SCORE_DESC,
  SCORE_EXCEL_FILTERS_INITIAL, scoreExcelRowMatchesColFilters, scoreExcelAnyColumnFiltersActive
} from "./tableShared.jsx";

const scoreFilterInput = {
  width: "4rem", padding: "0.28rem 0.35rem", fontSize: "0.78rem",
  borderRadius: "var(--tk-radius-sm)", border: "1px solid var(--tk-border)",
  background: "var(--tk-surface-inset)", color: "var(--tk-text)", boxSizing: "border-box"
};
const scorePresetBtn = {
  padding: "0.32rem 0.6rem", fontSize: "0.76rem", cursor: "pointer",
  borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)",
  background: "var(--tk-surface)", color: "var(--tk-text)", lineHeight: 1.35
};

function ScoreFilterPanel({ filterDraft, setFilterDraft, onApply, onClear, rawCount, filteredCount, appliedInactive }) {
  const mk = (key) => ({
    value: filterDraft[key],
    onChange: (e) => setFilterDraft((f) => ({ ...f, [key]: e.target.value }))
  });
  return (
    <section style={{ marginBottom: "0.85rem", padding: "0.65rem 0.85rem", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface-raised)" }} aria-label="Filtros da tabela Product Score">
      <div style={{ fontSize: "0.76rem", opacity: 0.88, marginBottom: "0.45rem", fontWeight: 600 }}>Presets rápidos</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
        {PRODUCT_SCORE_PRESETS.map((p) => (
          <button key={p.id} type="button" style={scorePresetBtn} title={p.description} onClick={() => setFilterDraft(p.fill)}>{p.label}</button>
        ))}
      </div>
      <div style={{ fontSize: "0.76rem", opacity: 0.82, marginBottom: "0.38rem" }}>Campos (preenchem o rascunho; vazio = sem limite)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 0.85rem", alignItems: "baseline", marginBottom: "0.55rem", fontSize: "0.76rem" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Preço min</span><input {...mk("precoMin")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Preço max</span><input {...mk("precoMax")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Vendas min</span><input {...mk("vendasMin")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Vendas max</span><input {...mk("vendasMax")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Rating min</span><input {...mk("ratingMin")} type="text" inputMode="decimal" style={scoreFilterInput} autoComplete="off" /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><span style={{ opacity: 0.9 }}>Score min</span><input {...mk("scoreMin")} type="text" inputMode="numeric" style={scoreFilterInput} autoComplete="off" /></label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button type="button" onClick={onApply} style={{ padding: "0.35rem 0.85rem", fontSize: "0.78rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-btn-primary-hover)", background: "var(--tk-btn-primary)", color: "#fff", fontWeight: 600 }}>Aplicar filtros</button>
        <button type="button" onClick={onClear} style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem", cursor: "pointer", borderRadius: "var(--tk-radius-md)", border: "1px solid var(--tk-border)", background: "var(--tk-surface)", color: "var(--tk-text)" }}>Limpar</button>
        <span style={{ fontSize: "0.72rem", opacity: 0.78 }}>Mostrando <strong>{filteredCount}</strong> de <strong>{rawCount}</strong> produtos (filtros só no cliente).</span>
        {!appliedInactive ? (<span style={{ fontSize: "0.7rem", opacity: 0.85, color: "var(--tk-accent)", fontWeight: 500 }}>Filtros activos</span>) : null}
      </div>
    </section>
  );
}

export default function TableScore({ data }) {
  const navigate = useNavigate();
  const rawRows = asArray(data?.top);
  const colW = useColumnWidths(CW_SCORE);
  const { ticketTier, setTicketTier } = useAnalyticsDashboardCache();

  const scoreIntro = (
    <IntroCard title="Product Score">
      <p style={introLead}>
        <strong>Ranking com base em múltiplos factores.</strong> O sistema soma pontos de
        vendas, avaliações, preço, desconto, faixa de oportunidade e variação de vendas face ao run anterior —
        sempre sobre a <strong>última importação</strong>, apenas <strong>em memória</strong>.
      </p>
      <p style={{ ...introLead, marginBottom: "0.45rem" }}>👉 Lista principal até <strong>30 produtos</strong> ordenados por score.</p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>pontua cada produto, ordena todos, mostra só o <strong>top 30</strong>.</li>
          <li>
            <strong>O máximo real é 85, não 100</strong> — e isso não é defeito. Os 15 pontos de
            «oportunidade» só entram entre 10 e 300 vendas, por isso um campeão de vendas nunca os
            ganha: por definição, já foi descoberto. Um produto com 85 não tem 15 pontos de
            qualidade em falta; tem 15 pontos de <em>ainda-não-ser-óbvio</em> em falta, que é o
            contrário.
          </li>
          <li>Colunas <strong>Enviar</strong> (workspace) e <strong>Ações</strong> (Spaces). O <strong>nome</strong> abre <code>/produto/…</code>.</li>
        </ul>
      </div>
      <div style={introWarn}>⚠️ Score interno — não representa lucro nem é um indicador oficial do TikTok. Serve para <strong>ordenar</strong>, não para ler como percentagem.</div>
    </IntroCard>
  );

  const [sort, setSort] = useState(() => ({ key: "score", dir: /** @type {"asc"|"desc"} */ ("desc") }));
  const [filterDraft, setFilterDraft] = useState(() => ({ ...INITIAL_FILTER_STATE }));
  const [filterApplied, setFilterApplied] = useState(() => ({ ...INITIAL_FILTER_STATE }));
  const [scoreExcelColFilters, setScoreExcelColFilters] = useState(() => ({ ...SCORE_EXCEL_FILTERS_INITIAL }));
  const [scoreExcelMenuKey, setScoreExcelMenuKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => { setScoreExcelColFilters({ ...SCORE_EXCEL_FILTERS_INITIAL }); setScoreExcelMenuKey(null); }, [data?.scrapeRun?.id]);

  const filteredRows = useMemo(() => applyProductFilters(rawRows, filterApplied), [rawRows, filterApplied]);
  const scoreTicketFiltered = useMemo(() => filteredRows.filter((r) => rowMatchesTicketFilter(ticketTier, /** @type {any} */ (r))), [filteredRows, ticketTier]);
  const scoreExcelFiltered = useMemo(() => scoreTicketFiltered.filter((r) => scoreExcelRowMatchesColFilters(/** @type {any} */ (r), scoreExcelColFilters)), [scoreTicketFiltered, scoreExcelColFilters]);
  const filtersScoreExcelActive = useMemo(() => scoreExcelAnyColumnFiltersActive(scoreExcelColFilters), [scoreExcelColFilters]);
  const rows = useMemo(() => { if (scoreExcelFiltered.length === 0) return []; return sortScoreRowsByColumn(scoreExcelFiltered, sort.key, sort.dir); }, [scoreExcelFiltered, sort]);

  /**
   * O que trava a maioria — a fila de trabalho que a ordenação escondia.
   *
   * Um score de 62 não diz o que fazer a seguir. Agrupar pela restrição que
   * morde primeiro diz: medido em 05/09/2026, 27 dos 30 produtos do ranking
   * travavam todos em `sem_galeria`, e um comando destravava-os. Isso não
   * aparecia em lado nenhum — cada linha mostrava só a sua nota.
   *
   * Só se mostra quando a restrição domina (≥ 1/3 das linhas): abaixo disso
   * não é uma tarefa, é dispersão, e o aviso vira ruído.
   */
  const travaDominante = useMemo(() => {
    const comTrava = rows.filter((r) => r.restricaoLigante);
    if (comTrava.length === 0) return null;
    const contagem = new Map();
    for (const r of comTrava) {
      const atual = contagem.get(r.restricaoLigante) ?? { n: 0, rotulo: r.rotuloRestricao, gatilho: r.gatilho };
      atual.n += 1;
      contagem.set(r.restricaoLigante, atual);
    }
    const [chave, info] = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (info.n < Math.max(3, Math.ceil(rows.length / 3))) return null;
    return { chave, ...info, total: rows.length };
  }, [rows]);

  const onApplyFilters = useCallback(() => { setFilterApplied({ ...filterDraft }); }, [filterDraft]);
  const onClearFilters = useCallback(() => { setFilterDraft({ ...INITIAL_FILTER_STATE }); setFilterApplied({ ...INITIAL_FILTER_STATE }); }, []);
  const onSort = useCallback((k) => { setSort((s) => toggleSort(s.key, s.dir, k, SORT_SCORE_DESC)); }, []);
  const onScoreExcelApplySort = useCallback((key, dir) => { setSort({ key, dir }); setScoreExcelMenuKey(null); }, []);

  if (data == null) return (<>{scoreIntro}<p style={{ opacity: 0.82 }}>Carregue os dados com o botão acima.</p></>);
  if (data?.message && rawRows.length === 0) return (<>{scoreIntro}<p style={{ opacity: 0.85 }}>{data.message}</p></>);
  if (rawRows.length === 0) return (<>{scoreIntro}<p>Sem linhas.</p></>);

  return (
    <>
      {scoreIntro}
      <ScoreFilterPanel filterDraft={filterDraft} setFilterDraft={setFilterDraft} onApply={onApplyFilters} onClear={onClearFilters} rawCount={rawRows.length} filteredCount={filteredRows.length} appliedInactive={filtersAreInactive(filterApplied)} />
      <TicketFilterBar value={ticketTier} onChange={setTicketTier} />
      {ticketTier !== "all" && filteredRows.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.76, marginBottom: "0.45rem" }}>Após filtro Ticket: <strong>{scoreTicketFiltered.length}</strong> de {filteredRows.length} linha(s).</p>
      ) : null}
      <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
        <strong>Ordem inicial:</strong> pontuação do <strong>maior para o menor</strong>. Menu <strong>▾</strong> filtra tipo Excel.{" "}
        <span style={{ opacity: 0.88, display: "block", marginTop: "0.25rem" }}><strong>Workspace:</strong> clique na linha (excepto nome-link, Enviar ou Abrir no TikTok) para abrir <code>/produto/…</code>.</span>
      </p>
      {filtersScoreExcelActive && scoreTicketFiltered.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Filtros ▾: <strong>{scoreExcelFiltered.length}</strong> de {scoreTicketFiltered.length} linha{scoreTicketFiltered.length !== 1 ? "s" : ""}.</p>
      ) : null}
      {travaDominante ? (
        <p
          style={{
            fontSize: "0.78rem",
            lineHeight: 1.5,
            marginBottom: "0.6rem",
            padding: "0.5rem 0.7rem",
            borderRadius: 8,
            border: "1px solid var(--tk-border)",
            background: "var(--tk-surface-2, transparent)"
          }}
        >
          <strong>
            {travaDominante.n} de {travaDominante.total} produtos travam na mesma coisa:
          </strong>{" "}
          {travaDominante.rotulo}.{" "}
          <span style={{ opacity: 0.85 }}>Para destravar: {travaDominante.gatilho}.</span>
        </p>
      ) : null}
      {filteredRows.length === 0 ? (
        <p style={{ opacity: 0.88 }}>Nenhum produto corresponde aos filtros — ajuste os limites ou clique em Limpar.</p>
      ) : scoreExcelFiltered.length === 0 ? (
        <p style={{ opacity: 0.88 }}>Nenhuma linha com os filtros ▾.{" "}<button type="button" className="tk-btn-soft" onClick={() => setScoreExcelColFilters({ ...SCORE_EXCEL_FILTERS_INITIAL })}>Limpar filtros de coluna</button></p>
      ) : (
        <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{colW.colElements}</colgroup>
          <thead>
            <tr>
              <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="score" colKey="score" filterMode="range" rangeMinKey="scoreMin" rangeMaxKey="scoreMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={{ key: "score", dir: "desc", label: "Ordenação (score ↓)" }} resizeColIdx={1} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="classificação" colKey="classific" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={2} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="nome" colKey="nome" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={3} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="categoria" colKey="categoriaPrincipal" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={4} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="sub" colKey="subcategoria" filterMode="category" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={5} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="loja" colKey="loja" filterMode="text" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={6} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="preço" colKey="preco" filterMode="range" rangeMinKey="precoMin" rangeMaxKey="precoMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={7} onGrip={colW.onGripMouseDown} />
              <PlainTh label="Ticket" title="Faixa de preço só no browser" resizeColIdx={8} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="vendas" colKey="vendas" filterMode="range" rangeMinKey="vendasMin" rangeMaxKey="vendasMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={9} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="rating" colKey="rating" filterMode="range" rangeMinKey="ratingMin" rangeMaxKey="ratingMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={10} onGrip={colW.onGripMouseDown} />
              <ExcelSortTh label="delta" colKey="delta" filterMode="range" rangeMinKey="deltaMin" rangeMaxKey="deltaMax" sortKey={sort.key} sortDir={sort.dir} onSortLabel={onSort} colFilters={scoreExcelColFilters} setColFilters={setScoreExcelColFilters} menuOpenKey={scoreExcelMenuKey} setMenuOpenKey={setScoreExcelMenuKey} onApplySort={onScoreExcelApplySort} datasetRows={scoreTicketFiltered} rowMatches={scoreExcelRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={11} onGrip={colW.onGripMouseDown} />
              <PlainTh label="Enviar" title="Enviar para análise" resizeColIdx={12} onGrip={colW.onGripMouseDown} />
              <PlainTh label="Ações" title="Exportar ao DigitalOcean Spaces" resizeColIdx={13} onGrip={colW.onGripMouseDown} />
              <PlainTh label="link" resizeColIdx={14} onGrip={colW.onGripMouseDown} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pidStr = String(row.productId ?? "").trim();
              return (
                <tr key={`${row.productId}-${i}`}
                  className={pidStr ? "tk-row-clickable" : undefined}
                  style={{ borderBottom: "1px solid var(--tk-border)", cursor: pidStr ? "pointer" : "default" }}
                  title={pidStr ? "Clique na linha para abrir o workspace" : undefined}
                  onClick={(e) => { if (!pidStr || isInteractiveTableCellClick(e)) return; void navigate(`/produto/${encodeURIComponent(pidStr)}`); }}>
                  <td style={tdPosStyle}>{i + 1}</td>
                  <td>
                    <span className="tk-metric">{row.score}</span>
                    {/*
                      Mesma marca do Ranking: score baixo por falta de dado não é
                      score baixo por dado ruim. Tem de aparecer nas DUAS tabelas
                      que mostram score, senão a ressalva vale só em metade das
                      telas e a outra metade continua a enganar.
                    */}
                    {row.confianca && row.confianca !== "completa" ? (
                      <span
                        title={
                          `Só ${row.confiancaPct}% do score pôde ser avaliado — falta: ` +
                          `${(row.faltando ?? []).join(", ")}. ` +
                          `O que falta não conta contra o produto; é lacuna de medição.`
                        }
                        style={{
                          fontSize: "0.68rem",
                          marginLeft: "0.35rem",
                          padding: "0.05rem 0.35rem",
                          borderRadius: 999,
                          border: "1px solid var(--tk-border)",
                          opacity: 0.85,
                          cursor: "help",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {row.confiancaPct}%
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {row.classific}
                    {/*
                      A restrição que morde primeiro. Fica junto da
                      classificação de propósito: "bom" e "trava em galeria"
                      são a mesma frase — o produto presta, o que falta é
                      nosso. Separá-los faria o leitor ler só o elogio.
                    */}
                    {row.restricaoLigante ? (
                      <span
                        title={`Trava: ${row.rotuloRestricao}. Para destravar: ${row.gatilho}`}
                        style={{
                          display: "block",
                          fontSize: "0.66rem",
                          marginTop: "0.15rem",
                          opacity: 0.72,
                          cursor: "help",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        ⛔ {row.rotuloRestricao}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                      <Link to={`/produto/${encodeURIComponent(row.productId)}`} title="Abrir workspace" className="tk-link-workspace">{row.nome}</Link>
                      <ProductLabelsChips row={/** @type {any} */ (row)} />
                    </div>
                  </td>
                  <td style={tdEllipsis} title={typeof row.categoriaPrincipal === "string" ? row.categoriaPrincipal : undefined}>{catCellPt(row.categoriaPrincipal)}</td>
                  <td style={tdEllipsis} title={typeof row.subcategoria === "string" ? row.subcategoria : undefined}>{catCellPt(row.subcategoria)}</td>
                  <td>{row.loja}</td>
                  <td>{row.preco ?? "—"}</td>
                  <TicketBadgeCell row={/** @type {any} */ (row)} />
                  <td><span className="tk-metric">{row.vendas ?? "—"}</span></td>
                  <td><span className="tk-metric">{row.rating ?? "—"}</span></td>
                  <td>{row.deltaVendas ?? "—"}</td>
                  <td style={{ verticalAlign: "top", padding: "0.35rem 0.3rem", overflow: "visible" }}>
                    {pidStr ? (<SendToAnalysisButton productId={pidStr} nome={typeof row.nome === "string" ? row.nome : undefined} tiktokUrl={typeof row.link === "string" ? row.link : undefined} className="tk-btn-primary" />) : "—"}
                  </td>
                  <td style={{ padding: "0.35rem 0.3rem", opacity: 0.85 }}>—</td>
                  <td>{row.link ? (<a href={row.link} target="_blank" rel="noopener noreferrer" className="tk-link-external">Abrir no TikTok</a>) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
