/**
 * Colunas que os relatórios analytics realmente leem de `ProductSnapshot`.
 *
 * Existe porque os relatórios usavam `include: { product: { include: { seller: true } } }`,
 * e `include` traz a linha INTEIRA — inclusive `images`, que sozinha ocupa 233 MB dos
 * 769 MB da tabela (~2,9 kB por linha). Um relatório que lista 21 mil snapshots do
 * último run puxava ~60 MB de JSON de fotos do Postgres para o Node só para os deitar
 * fora: nenhuma das tabelas mostra `images`, `reviewImages` ou `votesByStar`.
 *
 * Medido em 04/09/2026, antes desta mudança: `/analytics/product-score` levava 24 s
 * para devolver 18 kB de resposta. O tempo não estava no cálculo nem na rede — estava
 * em ler e desserializar colunas que ninguém pediu.
 *
 * `pdpImages` FICA: `hasAtLeastHttpPdpImages` usa-a para decidir a marca "enriched",
 * e são só ~120 bytes por linha (9,6 MB no total). `dataQuality` idem.
 */

/** Campos de `Product` usados pelos relatórios (a tabela não tem colunas JSON). */
export const PRODUCT_REPORT_SELECT = {
  id: true,
  productId: true,
  sourcePlatform: true,
  name: true,
  productUrl: true,
  categoryUrl: true,
  currency: true,
  sellerRefId: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
  delta7d: true,
  delta7dDias: true,
  delta7dEm: true,
  nucleo: true,
  especie: true,
  rotuloCurto: true,
  enrichStatus: true,
  enrichCheckedAt: true,
  enrichNote: true,
  hiddenAt: true,
  // `logoUrls` (Json) fica de fora de propósito — nenhum relatório de lista a usa.
  seller: { select: { id: true, name: true, sellerId: true, globalSellerId: true, logoUri: true } }
};

/**
 * `ProductSnapshot` sem as colunas JSON pesadas (`images`, `reviewImages`, `votesByStar`),
 * com o produto e a loja embutidos — substituto directo do antigo
 * `include: { product: { include: { seller: true } } }`.
 */
export const SNAPSHOT_REPORT_SELECT = {
  id: true,
  capturedAt: true,
  price: true,
  originalPrice: true,
  hasDiscount: true,
  estimatedShowcasePrice: true,
  estimatedPriceGap: true,
  estimatedPriceGapPercent: true,
  salesCount: true,
  salesText: true,
  ratingAverage: true,
  ratingTotal: true,
  pdpImages: true,
  dataQuality: true,
  productRefId: true,
  scrapeRunId: true,
  product: { select: PRODUCT_REPORT_SELECT }
};

/**
 * Idem, mais `scrapeRun` — para os modos "por categoria", que escolhem o snapshot
 * mais recente de cada produto comparando `collectedAt` entre runs.
 */
export const SNAPSHOT_REPORT_SELECT_WITH_RUN = {
  ...SNAPSHOT_REPORT_SELECT,
  scrapeRun: { select: { id: true, collectedAt: true } }
};
