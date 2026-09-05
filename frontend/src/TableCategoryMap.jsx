/**
 * TableCategoryMap.jsx — Aba "Mapa de categorias" do painel Analytics.
 * Extraído de App.jsx.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useColumnWidths } from "./useColumnWidths.jsx";
import { sortMapSubcatsByColumn, sortMapTopProductsByColumn } from "./sortUtils.js";
import { mapCategoryTableLabelsPt } from "./mapCategoryUi.js";
import SendToAnalysisButton from "./SendToAnalysisButton.jsx";
import {
  PlainTh, ExcelSortTh,
  IntroCard, positionThTitle, tdPosStyle, tdEllipsis,
  introLabel, introBullet, introLogicBox, introLogicLabel, introLogicUl, introWarn,
  toggleSort, asArray, isInteractiveTableCellClick, catCellPt,
  CW_MAP_SUB, CW_MAP_TOP, SORT_MAP_SUB_DESC, SORT_MAP_TOP_DESC, MAP_TOP_VISIBLE_DEFAULT,
  MAP_SUB_FILTERS_INITIAL, MAP_TOP_FILTERS_INITIAL,
  mapSubRowMatchesColFilters, mapTopRowMatchesColFilters,
  mapSubAnyColumnFiltersExcelActive, mapTopAnyColumnFiltersExcelActive
} from "./tableShared.jsx";

export default function TableCategoryMap({ data }) {
  const navigate = useNavigate();
  const masters = asArray(data?.masterCategories);
  const colWSub = useColumnWidths(CW_MAP_SUB);
  const colWTop = useColumnWidths(CW_MAP_TOP);

  const mapIntro = (
    <IntroCard title="Mapa de categorias">
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55 }}>
        <strong>Visão geral dos produtos agrupados por categoria.</strong> Agrupa com base nas categorias já guardadas nos produtos (a partir do texto ou URL na importação).
      </p>
      <div style={introLabel}>📊 Métricas agregadas por pasta (primeira tabela):</div>
      <ul style={{ ...introBullet, marginBottom: "0.5rem" }}>
        <li>quantidade de produtos</li>
        <li>vendas totais</li>
        <li>médias de preço e de avaliação</li>
        <li>score médio da pasta (média simples das pontuações 0–100)</li>
      </ul>
      <p style={{ margin: "0 0 0.55rem", lineHeight: 1.55 }}>
        Há também uma segunda listagem combinada <strong>SKU em destaque</strong> — até <strong>cinco</strong> por subcategoria ordenados por score.
      </p>
      <div style={introLogicBox}>
        <div style={introLogicLabel}>Como funciona (por dentro)</div>
        <ul style={introLogicUl}>
          <li>agrupa produtos da última importação pela <strong>categoria</strong> extraída do texto ou URL;</li>
          <li>por pasta calcula contagens, somas de vendas, médias; o <strong>score da pasta</strong> é a média simples 0–100;</li>
          <li>em cada subcategoria lista até <strong>cinco</strong> produtos exemplo por score descendente.</li>
        </ul>
      </div>
      <div style={introLabel}>👉 Use para:</div>
      <ul style={introBullet}>
        <li>entender quais categorias estão mais fortes</li>
        <li>identificar onde focar</li>
      </ul>
      <div style={introWarn}>⚠️ Categorias derivadas dos dados importados — não são classificações oficiais do TikTok.</div>
      <p style={{ margin: "0.55rem 0 0", lineHeight: 1.55, fontSize: "0.82rem", opacity: 0.9 }}>
        A <strong>primeira tabela</strong> (pastas / subcategorias) é só agregação — não abre workspace. Na segunda tabela (<strong>SKU em destaque</strong>), cada linha é um produto: clique na linha (excepto <strong>Exportar</strong> ou Abrir no TikTok) para abrir <code>/produto/…</code>.
      </p>
    </IntroCard>
  );

  const flatSubcats = useMemo(() => {
    const rows = [];
    for (const m of masters) {
      for (const sub of asArray(m.subcategories)) {
        rows.push({
          masterName: m.name ?? "—", subName: sub.name ?? "—", classification: sub.classification ?? "",
          score: sub.score ?? 0, totalProducts: sub.totalProducts ?? 0, totalSales: sub.totalSales ?? 0,
          avgRating: sub.avgRating ?? 0, avgPrice: sub.avgPrice ?? 0, opportunities: sub.opportunities ?? 0,
          _key: `${m.name ?? ""}::${sub.name ?? ""}`
        });
      }
    }
    return rows;
  }, [masters]);

  const flatTops = useMemo(() => {
    const rows = [];
    for (const m of masters) {
      for (const sub of asArray(m.subcategories)) {
        for (const p of asArray(sub.topProducts)) {
          rows.push({
            masterName: m.name ?? "—", subName: sub.name ?? "—",
            nome: p.nome ?? "—", categoriaPrincipal: p.categoriaPrincipal ?? "—",
            subcategoria: p.subcategoria ?? "—", productId: p.productId ?? "",
            score: p.score ?? 0, vendas: typeof p.vendas === "number" ? p.vendas : Number(p.vendas) || 0,
            rating: p.rating ?? null, preco: p["preço"] != null ? p["preço"] : p.preco,
            delta: p.delta != null ? p.delta : null, link: p.link ?? "",
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

  const [sortSub, setSortSub] = useState(() => ({ key: "score", dir: /** @type {"asc"|"desc"} */ ("desc") }));
  const [sortTop, setSortTop] = useState(() => ({ key: "score", dir: /** @type {"asc"|"desc"} */ ("desc") }));

  const flatSubFiltered = useMemo(() => flatSubcats.filter((r) => mapSubRowMatchesColFilters(/** @type {any} */ (r), mapSubColFilters)), [flatSubcats, mapSubColFilters]);
  const flatTopFiltered = useMemo(() => flatTops.filter((r) => mapTopRowMatchesColFilters(/** @type {any} */ (r), mapTopColFilters)), [flatTops, mapTopColFilters]);
  const mapSubFiltersExcelActive = useMemo(() => mapSubAnyColumnFiltersExcelActive(mapSubColFilters), [mapSubColFilters]);
  const mapTopFiltersExcelActive = useMemo(() => mapTopAnyColumnFiltersExcelActive(mapTopColFilters), [mapTopColFilters]);

  const sortedSubcats = useMemo(() => flatSubFiltered.length === 0 ? [] : sortMapSubcatsByColumn(flatSubFiltered, sortSub.key, sortSub.dir), [flatSubFiltered, sortSub]);
  const sortedTops = useMemo(() => flatTopFiltered.length === 0 ? [] : sortMapTopProductsByColumn(flatTopFiltered, sortTop.key, sortTop.dir), [flatTopFiltered, sortTop]);

  /**
   * A tabela "SKU em destaque" mostra 20 linhas por defeito — ver
   * `MAP_TOP_VISIBLE_DEFAULT`. O corte é só de visualização: `sortedTops` (já
   * filtrado e ordenado sobre a lista inteira) é que alimenta os menus das
   * colunas e a contagem, por isso filtrar e ordenar continua a ver tudo.
   */
  const [expandedTop, setExpandedTop] = useState(false);
  useEffect(() => { setExpandedTop(false); }, [data?.scrapeRun?.id]);
  const displayTops = useMemo(
    () => (expandedTop || sortedTops.length <= MAP_TOP_VISIBLE_DEFAULT ? sortedTops : sortedTops.slice(0, MAP_TOP_VISIBLE_DEFAULT)),
    [sortedTops, expandedTop]
  );

  const onSortSub = useCallback((k) => { setSortSub((s) => toggleSort(s.key, s.dir, k, SORT_MAP_SUB_DESC)); }, []);
  const onSortTop = useCallback((k) => { setSortTop((s) => toggleSort(s.key, s.dir, k, SORT_MAP_TOP_DESC)); }, []);
  const onMapSubApplySort = useCallback((key, dir) => { setSortSub({ key, dir }); setMapSubMenuKey(null); }, []);
  const onMapTopApplySort = useCallback((key, dir) => { setSortTop({ key, dir }); setMapTopMenuKey(null); }, []);

  if (data == null) {
    return (
      <>
        {mapIntro}
        <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>Carregue dados acima.</p>
      </>
    );
  }

  const tdStyle = { padding: "0.35rem 0.45rem", verticalAlign: "middle" };

  return (
    <>
      {mapIntro}
      {data.scoreNote ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.74, marginBottom: "0.5rem", maxWidth: "48rem" }}>{String(data.scoreNote)}</p>
      ) : null}

      {/* ── Tabela 1: Subcategorias agregadas ── */}
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.45rem", color: "var(--tk-text)" }}>Pastas / subcategorias</h3>
      {mapSubFiltersExcelActive && flatSubcats.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Filtros ▾: <strong>{flatSubFiltered.length}</strong> de {flatSubcats.length} linha(s).</p>
      ) : null}
      <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colWSub.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="mestre" colKey="masterName" filterMode="text" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={1} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="categoria" colKey="subName" filterMode="text" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={2} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="classif." colKey="classification" filterMode="text" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={3} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="score" colKey="score" filterMode="range" rangeMinKey="scoreMin" rangeMaxKey="scoreMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={4} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="SKUs" colKey="totalProducts" filterMode="range" rangeMinKey="totalProductsMin" rangeMaxKey="totalProductsMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={5} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="vendas" colKey="totalSales" filterMode="range" rangeMinKey="totalSalesMin" rangeMaxKey="totalSalesMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={6} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="rating" colKey="avgRating" filterMode="range" rangeMinKey="avgRatingMin" rangeMaxKey="avgRatingMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={7} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="preço médio" colKey="avgPrice" filterMode="range" rangeMinKey="avgPriceMin" rangeMaxKey="avgPriceMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={8} onGrip={colWSub.onGripMouseDown} />
            <ExcelSortTh label="oport." colKey="opportunities" filterMode="range" rangeMinKey="opportunitiesMin" rangeMaxKey="opportunitiesMax" sortKey={sortSub.key} sortDir={sortSub.dir} onSortLabel={onSortSub} colFilters={mapSubColFilters} setColFilters={setMapSubColFilters} menuOpenKey={mapSubMenuKey} setMenuOpenKey={setMapSubMenuKey} onApplySort={onMapSubApplySort} datasetRows={flatSubcats} rowMatches={mapSubRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={9} onGrip={colWSub.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {sortedSubcats.length === 0 ? (
            <tr><td colSpan={10} style={{ ...tdStyle, padding: "0.75rem 0.45rem" }}>Nenhuma linha com os filtros ▾.{" "}<button type="button" className="tk-btn-soft" onClick={() => setMapSubColFilters({ ...MAP_SUB_FILTERS_INITIAL })}>Limpar filtros</button></td></tr>
          ) : (
            sortedSubcats.map((row, i) => (
              <tr key={row._key}>
                <td style={{ ...tdStyle, ...tdPosStyle }}>{i + 1}</td>
                <td style={tdStyle}>{row.masterName}</td>
                <td style={tdStyle}>{row.subName}</td>
                <td style={tdStyle}>{row.classification || "—"}</td>
                <td style={tdStyle}><span className="tk-metric">{row.score}</span></td>
                <td style={tdStyle}>{row.totalProducts}</td>
                <td style={tdStyle}><span className="tk-metric">{row.totalSales}</span></td>
                <td style={tdStyle}>{row.avgRating != null ? row.avgRating : "—"}</td>
                <td style={tdStyle}>{row.avgPrice != null ? row.avgPrice : "—"}</td>
                <td style={tdStyle}>{row.opportunities}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ── Tabela 2: SKU em destaque ── */}
      <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "1.5rem 0 0.45rem", color: "var(--tk-text)" }}>SKU em destaque (top por score em cada subcategoria)</h3>
      {mapTopFiltersExcelActive && flatTops.length > 0 ? (
        <p style={{ fontSize: "0.72rem", opacity: 0.78, marginBottom: "0.5rem" }}>Filtros ▾: <strong>{flatTopFiltered.length}</strong> de {flatTops.length} linha(s).</p>
      ) : null}
      <table className="tk-analytics-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{colWTop.colElements}</colgroup>
        <thead>
          <tr>
            <PlainTh label="#" title={positionThTitle} resizeColIdx={0} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="mestre" colKey="masterName" filterMode="text" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={1} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="categoria" colKey="subName" filterMode="text" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} quickSortShortcut={null} resizeColIdx={2} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="nome" colKey="nome" filterMode="text" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:nome" quickSortShortcut={null} resizeColIdx={3} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="cat. SKU" colKey="categoriaPrincipal" filterMode="category" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:categoriaPrincipal" quickSortShortcut={null} resizeColIdx={4} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="sub SKU" colKey="subcategoria" filterMode="category" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:subcategoria" quickSortShortcut={null} resizeColIdx={5} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="score" colKey="score" filterMode="range" rangeMinKey="scoreMin" rangeMaxKey="scoreMax" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:score" quickSortShortcut={null} resizeColIdx={6} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="vendas" colKey="vendas" filterMode="range" rangeMinKey="vendasMin" rangeMaxKey="vendasMax" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:vendas" quickSortShortcut={null} resizeColIdx={7} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="rating" colKey="rating" filterMode="range" rangeMinKey="ratingMin" rangeMaxKey="ratingMax" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:rating" quickSortShortcut={null} resizeColIdx={8} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="preço" colKey="preco" filterMode="range" rangeMinKey="precoMin" rangeMaxKey="precoMax" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:preco" quickSortShortcut={null} resizeColIdx={9} onGrip={colWTop.onGripMouseDown} />
            <ExcelSortTh label="Δ vendas" colKey="delta" filterMode="range" rangeMinKey="deltaMin" rangeMaxKey="deltaMax" sortKey={sortTop.key} sortDir={sortTop.dir} onSortLabel={onSortTop} colFilters={mapTopColFilters} setColFilters={setMapTopColFilters} menuOpenKey={mapTopMenuKey} setMenuOpenKey={setMapTopMenuKey} onApplySort={onMapTopApplySort} datasetRows={flatTops} rowMatches={mapTopRowMatchesColFilters} menuHeaderId="top:delta" quickSortShortcut={null} resizeColIdx={10} onGrip={colWTop.onGripMouseDown} />
            <PlainTh label="Ações" title="Exportar ao DigitalOcean Spaces" resizeColIdx={11} onGrip={colWTop.onGripMouseDown} />
            <PlainTh label="link" resizeColIdx={12} onGrip={colWTop.onGripMouseDown} />
          </tr>
        </thead>
        <tbody>
          {sortedTops.length === 0 ? (
            <tr><td colSpan={13} style={{ ...tdStyle, padding: "0.75rem 0.45rem" }}>Nenhuma linha com os filtros ▾.{" "}<button type="button" className="tk-btn-soft" onClick={() => setMapTopColFilters({ ...MAP_TOP_FILTERS_INITIAL })}>Limpar filtros</button></td></tr>
          ) : (
            displayTops.map((row, i) => {
              const { mestre, categoria } = mapCategoryTableLabelsPt(row.masterName, row.subName);
              const pid = String(row.productId ?? "").trim();
              return (
                <tr key={row.rowKey || i}
                  className={pid ? "tk-row-clickable" : undefined}
                  style={{ cursor: pid ? "pointer" : "default" }}
                  title={pid ? "Clique na linha para abrir o workspace deste produto" : undefined}
                  onClick={(e) => { if (isInteractiveTableCellClick(e) || !pid) return; void navigate(`/produto/${encodeURIComponent(pid)}`); }}>
                  <td style={{ ...tdStyle, ...tdPosStyle }}>{i + 1}</td>
                  <td style={tdStyle}>{mestre}</td>
                  <td style={tdStyle}>{categoria}</td>
                  <td style={tdStyle}>{row.nome}</td>
                  <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.categoriaPrincipal ?? "")}>{catCellPt(row.categoriaPrincipal)}</td>
                  <td style={{ ...tdStyle, ...tdEllipsis }} title={String(row.subcategoria ?? "")}>{catCellPt(row.subcategoria)}</td>
                  <td style={tdStyle}><span className="tk-metric">{row.score}</span></td>
                  <td style={tdStyle}><span className="tk-metric">{row.vendas ?? "—"}</span></td>
                  <td style={tdStyle}><span className="tk-metric">{row.rating != null ? row.rating : "—"}</span></td>
                  <td style={tdStyle}>{row.preco != null ? row.preco : "—"}</td>
                  <td style={tdStyle}>{row.delta != null ? row.delta : "—"}</td>
                  <td style={tdStyle}>
                    {pid ? (<SendToAnalysisButton productId={pid} nome={typeof row.nome === "string" ? row.nome : undefined} tiktokUrl={typeof row.link === "string" ? row.link : undefined} className="tk-btn-primary" />) : "—"}
                  </td>
                  <td style={tdStyle}>{row.link ? (<a href={row.link} target="_blank" rel="noopener noreferrer" className="tk-link-external">Abrir no TikTok</a>) : "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {sortedTops.length > MAP_TOP_VISIBLE_DEFAULT ? (
        <p style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="tk-btn-soft" onClick={() => setExpandedTop((v) => !v)}>
            {expandedTop
              ? `Mostrar só os primeiros ${MAP_TOP_VISIBLE_DEFAULT}`
              : `Ver mais (${(sortedTops.length - MAP_TOP_VISIBLE_DEFAULT).toLocaleString("pt-BR")} seguintes)`}
          </button>
          <span style={{ fontSize: "0.72rem", opacity: 0.78 }}>
            {displayTops.length.toLocaleString("pt-BR")} de {sortedTops.length.toLocaleString("pt-BR")} linha(s).
            {" "}Filtros ▾ e ordenação continuam a usar as {sortedTops.length.toLocaleString("pt-BR")}.
          </span>
        </p>
      ) : null}
    </>
  );
}
