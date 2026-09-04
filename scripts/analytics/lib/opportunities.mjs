/**
 * Oportunidades heurísticas v1 — lógica partilhada CLI / API.
 *
 * Sem `categoryUrl`: apenas snapshots do **último** ScrapeRun (comportamento original).
 *
 * Com `categoryUrl`: por cada produto da categoria, usa-se o snapshot cujo run tem o maior
 * **`ScrapeRun.collected_at`** (empate determinístico no `run.id`), alinhado ao padrão de Top Products;
 * em seguida aplicam-se os critérios do **modo** escolhido (`classic`, `low_sales`, `no_sales`, `below_median`).
 */
import { getLatestAndPreviousRun } from "../_common.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";
import { hasAtLeastHttpPdpImages } from "../../lib/extract-image-urls.mjs";
import { SNAPSHOT_REPORT_SELECT, SNAPSHOT_REPORT_SELECT_WITH_RUN } from "./snapshot-select.mjs";

export const OPPORTUNITIES_DEFAULT_LIMIT = 20;
export const OPPORTUNITIES_MAX_LIMIT = 10000;

/** @typedef {"classic" | "low_sales" | "no_sales" | "below_median"} OpportunityMode */

export const OPPORTUNITY_MODES = /** @type {const} */ ([
  "classic",
  "low_sales",
  "no_sales",
  "below_median"
]);

/** @param {unknown} raw */
export function clampOpportunitiesLimit(raw) {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return OPPORTUNITIES_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(n), OPPORTUNITIES_MAX_LIMIT);
}

/**
 * Normaliza query `mode` da API / UI.
 * @param {unknown} raw
 * @returns {OpportunityMode}
 */
export function parseOpportunityMode(raw) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "" || s === "classic" || s === "v1") {
    return "classic";
  }
  if (s === "low_sales" || s === "low") {
    return "low_sales";
  }
  if (s === "no_sales" || s === "zero") {
    return "no_sales";
  }
  if (s === "below_median" || s === "median") {
    return "below_median";
  }
  return "classic";
}

/** Critérios comuns de qualidade (exceto modo de vendas). */
export function snapshotMatchesBaseQuality(s) {
  if (s.price == null) {
    return false;
  }
  if (s.ratingAverage == null || s.ratingAverage < 4.5) {
    return false;
  }
  if (s.ratingTotal == null || s.ratingTotal < 5) {
    return false;
  }
  return true;
}

/**
 * Critérios mínimos só para modo `no_sales` — **sem** rating/reviews mínimos (produtos sem venda costumam não ter reviews).
 * @param {*} s — snapshot com `product` incluído quando vindo do relatório por categoria.
 */
export function snapshotMatchesNoSalesQuality(s) {
  if (s.price == null) {
    return false;
  }
  const p = s.product;
  if (p == null || p.productId == null || String(p.productId).trim() === "") {
    return false;
  }
  return true;
}

/**
 * @param {Pick<import("@prisma/client").ProductSnapshot, "salesCount">} s
 * @param {OpportunityMode} mode
 */
export function snapshotMatchesSalesMode(s, mode) {
  const sc = s.salesCount;
  if (mode === "classic") {
    if (sc == null) {
      return false;
    }
    return sc >= 10 && sc <= 300;
  }
  if (mode === "low_sales") {
    if (sc == null) {
      return false;
    }
    return sc >= 1 && sc <= 99;
  }
  if (mode === "no_sales") {
    return sc == null || sc === 0;
  }
  return false;
}

/** @param {OpportunityMode} mode */
export function opportunityModeRuleNote(mode) {
  const baseQuality =
    "preço definido; rating médio ≥4,5; total de avaliações ≥5 — heurística exploratória (ver docs/ANALYTICS.md).";
  if (mode === "classic") {
    return `Modo classic: vendas entre 10 e 300; ${baseQuality}`;
  }
  if (mode === "low_sales") {
    return `Modo vendas baixas: vendas entre 1 e 99 (com valor registado); ${baseQuality}`;
  }
  if (mode === "no_sales") {
    return `Modo sem vendas: vendas = 0 ou ausentes no snapshot; preço definido; produto com identificador; não exige rating nem mínimo de avaliações (ver docs/ANALYTICS.md).`;
  }
  return `Modo abaixo da mediana: vendas ≥1 e estritamente abaixo da mediana de vendas da mesma categoria (mestre) no último run; ${baseQuality}`;
}

/**
 * Mensagem quando não há linhas (evita confundir `no_sales` com os outros modos).
 * @param {OpportunityMode} mode
 * @param {"global" | "category"} scope
 * @param {{ latestId?: string, filterKey?: string }} ctx
 */
function opportunitiesEmptyListMessage(mode, scope, ctx) {
  if (mode === "no_sales") {
    return scope === "category"
      ? "Nenhum produto sem vendas encontrado para este filtro/categoria."
      : "Nenhum produto sem vendas encontrado.";
  }
  if (scope === "category") {
    return `Último snapshot por produto nesta categoria: nenhum coincide com o modo "${mode}" (${ctx.filterKey ?? ""}).`;
  }
  return `Último ScrapeRun (${ctx.latestId ?? "?"}): nenhum produto coincide com o modo "${mode}".`;
}

/**
 * @param {number[]} sorted — ordenado asc
 * @returns {number | null}
 */
function medianOfSortedAsc(sorted) {
  const n = sorted.length;
  if (n === 0) {
    return null;
  }
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {string | null | undefined} categoryUrl */
function masterCategoryKey(categoryUrl) {
  const { masterCategory } = parseCategory(categoryUrl);
  const t = masterCategory != null ? String(masterCategory).trim() : "";
  return t !== "" ? t : "(sem categoria lista)";
}

/**
 * Mediana de `salesCount` por categoria mestre — só linhas com vendas não nulas no run.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} latestRunId
 */
async function computeMedianSalesByMasterCategory(prisma, latestRunId) {
  const rows = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latestRunId,
      salesCount: { not: null },
      product: { hiddenAt: null }
    },
    select: {
      salesCount: true,
      product: { select: { categoryUrl: true } }
    }
  });

  /** @type {Map<string, number[]>} */
  const bucket = new Map();
  for (const r of rows) {
    const sc = r.salesCount;
    if (sc == null || !Number.isFinite(Number(sc))) {
      continue;
    }
    const key = masterCategoryKey(r.product?.categoryUrl);
    if (!bucket.has(key)) {
      bucket.set(key, []);
    }
    bucket.get(key).push(Number(sc));
  }

  /** @type {Map<string, number>} */
  const median = new Map();
  for (const [k, arr] of bucket) {
    arr.sort((a, b) => a - b);
    const m = medianOfSortedAsc(arr);
    if (m != null) {
      median.set(k, m);
    }
  }
  return median;
}

/**
 * @param {import("@prisma/client").ProductSnapshot & { product?: { categoryUrl?: string | null } | null }} s
 * @param {Map<string, number>} medianMap
 */
function snapshotMatchesBelowMedian(s, medianMap) {
  if (!snapshotMatchesBaseQuality(s)) {
    return false;
  }
  const sc = s.salesCount;
  if (sc == null || sc < 1) {
    return false;
  }
  const key = masterCategoryKey(s.product?.categoryUrl);
  const med = medianMap.get(key);
  if (med == null) {
    return false;
  }
  return Number(sc) < med;
}

/**
 * @param {*} s — snapshot com product + seller
 * @param {string} motivo
 */
function snapshotToOpportunityRow(s, motivo) {
  const { masterCategory: categoriaPrincipal, subcategory: subcategoria } = parseCategory(s.product?.categoryUrl);
  const enriched =
    s?.dataQuality &&
    typeof s.dataQuality === "object" &&
    s.dataQuality.enrichment &&
    typeof s.dataQuality.enrichment === "object" &&
    s.dataQuality.enrichment.status === "enriched"
      ? true
      : hasAtLeastHttpPdpImages(s, 3);
  return {
    productId: s.product.productId,
    nome: (s.product.name ?? "").slice(0, 40),
    categoriaPrincipal,
    subcategoria,
    loja: (s.product.seller?.name ?? "—").slice(0, 28),
    preco: s.price,
    vendas: s.salesCount,
    /**
     * `false` = o TikTok não mostrou contador de vendas neste card.
     *
     * No modo `no_sales`, "vendeu zero" e "não sabemos quanto vendeu" caem os
     * dois na mesma lista (decisão antiga, travada em teste). Só que são coisas
     * diferentes na hora de decidir: zero medido é sinal de mercado, ausência
     * é falta de leitura. Sem este campo a tela mostra as duas como "0" e quem
     * lê não tem como distinguir.
     */
    vendasMedidas: s.salesCount != null,
    avalMed: s.ratingAverage,
    avalTot: s.ratingTotal,
    motivo,
    enriched,
    link: s.product.productUrl ?? ""
  };
}

/**
 * Quantos dos itens listados têm vendas realmente medidas.
 *
 * Viaja com a resposta para o painel poder dizer "12 destes 30 não têm leitura
 * de vendas" em vez de mostrar trinta zeros iguais. É o mesmo princípio do `n`
 * ao lado da mediana: o número sozinho esconde de que amostra ele saiu.
 *
 * @param {Array<{ vendasMedidas?: boolean }>} items
 */
export function resumoDeMedicao(items) {
  const lista = Array.isArray(items) ? items : [];
  const semMedicao = lista.filter((i) => i && i.vendasMedidas === false).length;
  return { listados: lista.length, comVendaMedida: lista.length - semMedicao, semVendaMedida: semMedicao };
}

/** Texto público da regra v1 (compat. docs / CLI). */
export const OPPORTUNITIES_RULE_V1_NOTE = opportunityModeRuleNote("classic");

/**
 * @param {Array<import("@prisma/client").ProductSnapshot & { scrapeRun?: { id: string, collectedAt: Date } | null }>} snaps
 */
function pickLatestSnapshotPerProductRef(snaps) {
  /** @type {Map<string, (typeof snaps)[number]>} */
  const bestByProductRef = new Map();
  for (const s of snaps) {
    const ct = s.scrapeRun?.collectedAt ? new Date(s.scrapeRun.collectedAt).getTime() : 0;
    const rid = s.scrapeRun?.id ?? "";
    const prev = bestByProductRef.get(s.productRefId);
    if (!prev) {
      bestByProductRef.set(s.productRefId, s);
      continue;
    }
    const pCt = prev.scrapeRun?.collectedAt ? new Date(prev.scrapeRun.collectedAt).getTime() : 0;
    const pRid = prev.scrapeRun?.id ?? "";
    if (ct > pCt || (ct === pCt && rid && pRid && rid.localeCompare(pRid) < 0)) {
      bestByProductRef.set(s.productRefId, s);
    }
  }
  return bestByProductRef;
}

/**
 * Ordenação estável esperada pela UI: média desc., depois vendas desc.
 * @param {typeof import("@prisma/client").ProductSnapshot} a
 * @param {typeof import("@prisma/client").ProductSnapshot} b
 */
function compareOpportunitySnapshots(a, b) {
  const ra = a.ratingAverage ?? 0;
  const rb = b.ratingAverage ?? 0;
  if (rb !== ra) {
    return rb - ra;
  }
  return Number(b.salesCount ?? 0) - Number(a.salesCount ?? 0);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ categoryUrl?: string, limit?: number, mode?: OpportunityMode }} [opts]
 *   — `limit` em [1, OPPORTUNITIES_MAX_LIMIT]; omitido → OPPORTUNITIES_DEFAULT_LIMIT (CLI).
 */
export async function getOpportunitiesReport(prisma, opts = {}) {
  const rawCat =
    opts.categoryUrl != null && typeof opts.categoryUrl === "string" ? opts.categoryUrl.trim() : "";
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.min(Math.max(1, Math.floor(opts.limit)), OPPORTUNITIES_MAX_LIMIT)
      : OPPORTUNITIES_DEFAULT_LIMIT;

  const mode = opts.mode ?? "classic";

  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado.",
      opportunityMode: mode
    };
  }

  const motivoShort =
    mode === "classic"
      ? "regra ANALYTICS v1 (classic)"
      : mode === "low_sales"
        ? "vendas baixas (1–99)"
        : mode === "no_sales"
          ? "sem vendas declaradas (0 ou n/d)"
          : "abaixo da mediana de vendas da categoria";

  /** @type {(s: import("@prisma/client").ProductSnapshot) => boolean} */
  let predicate;
  /** @type {Map<string, number> | null} */
  let medianMap = null;

  if (mode === "below_median") {
    medianMap = await computeMedianSalesByMasterCategory(prisma, latest.id);
    predicate = (s) => snapshotMatchesBelowMedian(s, medianMap);
  } else if (mode === "no_sales") {
    predicate = (s) =>
      snapshotMatchesNoSalesQuality(/** @type {any} */ (s)) &&
      snapshotMatchesSalesMode(/** @type {any} */ (s), mode);
  } else {
    predicate = (s) =>
      snapshotMatchesBaseQuality(s) && snapshotMatchesSalesMode(/** @type {any} */ (s), mode);
  }

  if (!rawCat) {
    if (mode !== "below_median") {
      /** @type {import("@prisma/client").Prisma.ProductSnapshotWhereInput} */
      let whereSales;
      if (mode === "classic") {
        whereSales = { gte: 10, lte: 300 };
      } else if (mode === "low_sales") {
        whereSales = { gte: 1, lte: 99 };
      } else {
        whereSales = { in: [] };
      }

      /** @type {import("@prisma/client").Prisma.ProductSnapshotWhereInput} */
      const whereGlobal =
        mode === "no_sales"
          ? {
              scrapeRunId: latest.id,
              price: { not: null },
              product: { productId: { not: "" }, hiddenAt: null },
              OR: [{ salesCount: null }, { salesCount: 0 }]
            }
          : {
              scrapeRunId: latest.id,
              price: { not: null },
              product: { hiddenAt: null },
              ratingAverage: { gte: 4.5 },
              ratingTotal: { gte: 5 },
              salesCount: whereSales
            };

      const rankingTotal = await prisma.productSnapshot.count({ where: whereGlobal });

      if (rankingTotal === 0) {
        return {
          scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
          items: [],
          rankingTotal: 0,
          listed: 0,
          limit,
          truncated: false,
          maxRows: limit,
          ruleNote: opportunityModeRuleNote(mode),
          opportunityMode: mode,
          message: opportunitiesEmptyListMessage(mode, "global", { latestId: latest.id })
        };
      }

      const rows = await prisma.productSnapshot.findMany({
        where: whereGlobal,
        select: SNAPSHOT_REPORT_SELECT,
        orderBy:
          mode === "no_sales"
            ? [{ capturedAt: "desc" }]
            : [{ ratingAverage: "desc" }, { salesCount: "desc" }],
        take: limit
      });

      const items = rows.map((s) => snapshotToOpportunityRow(s, motivoShort));
      const truncated = rankingTotal > items.length;

      return {
        scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        items,
        medicao: resumoDeMedicao(items),
        ruleNote: opportunityModeRuleNote(mode),
        opportunityMode: mode,
        listed: items.length,
        rankingTotal,
        limit,
        truncated,
        maxRows: limit
      };
    }

    const allRun = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: latest.id, product: { hiddenAt: null } },
      select: SNAPSHOT_REPORT_SELECT
    });
    const candidates = allRun.filter((s) => predicate(s));
    candidates.sort(compareOpportunitySnapshots);
    const rankingTotal = candidates.length;
    const top = candidates.slice(0, limit);
    if (top.length === 0) {
      return {
        scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
        items: [],
        rankingTotal: 0,
        listed: 0,
        limit,
        truncated: false,
        maxRows: limit,
        ruleNote: opportunityModeRuleNote(mode),
        opportunityMode: mode,
        message: `Último ScrapeRun (${latest.id}): nenhum produto coincide com o modo "${mode}".`
      };
    }
    const items = top.map((s) => snapshotToOpportunityRow(s, motivoShort));
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items,
      medicao: resumoDeMedicao(items),
      ruleNote: opportunityModeRuleNote(mode),
      opportunityMode: mode,
      listed: items.length,
      rankingTotal,
      limit,
      truncated: rankingTotal > items.length,
      maxRows: limit
    };
  }

  const filterKey = normalizeCategoryKey(rawCat);
  if (!filterKey) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      opportunityMode: mode,
      message: "categoryUrl normalizado ficou vazio — confirme a URL da categoria."
    };
  }

  const products = await prisma.product.findMany({
    where: { categoryUrl: { not: null }, hiddenAt: null },
    select: { id: true, categoryUrl: true }
  });
  const inCategoryIds = products
    .filter((p) => p.categoryUrl != null && normalizeCategoryKey(p.categoryUrl) === filterKey)
    .map((p) => p.id);

  if (inCategoryIds.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      categoryUrlFilter: filterKey,
      opportunityMode: mode,
      message: `Nenhum produto encontrado para categoria (${filterKey}).`
    };
  }

  if (medianMap == null && mode === "below_median") {
    medianMap = await computeMedianSalesByMasterCategory(prisma, latest.id);
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { productRefId: { in: inCategoryIds } },
    select: SNAPSHOT_REPORT_SELECT_WITH_RUN
  });

  const latestByProd = pickLatestSnapshotPerProductRef(snaps);

  /** @type {typeof snaps} */
  const candidates = [...latestByProd.values()].filter((s) =>
    mode === "below_median"
      ? snapshotMatchesBelowMedian(s, /** @type {Map<string, number>} */ (medianMap))
      : predicate(s)
  );
  candidates.sort(compareOpportunitySnapshots);
  const rankingTotal = candidates.length;
  const top = candidates.slice(0, limit);

  if (top.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      listed: 0,
      rankingTotal: 0,
      limit,
      truncated: false,
      maxRows: limit,
      categoryUrlFilter: filterKey,
      opportunityMode: mode,
      ruleNote: opportunityModeRuleNote(mode),
      message: opportunitiesEmptyListMessage(mode, "category", { filterKey })
    };
  }

  const items = top.map((s) => snapshotToOpportunityRow(s, motivoShort));
  const truncated = rankingTotal > items.length;

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    medicao: resumoDeMedicao(items),
    ruleNote: opportunityModeRuleNote(mode),
    opportunityMode: mode,
    listed: items.length,
    rankingTotal,
    limit,
    truncated,
    maxRows: limit,
    categoryUrlFilter: filterKey
  };
}
