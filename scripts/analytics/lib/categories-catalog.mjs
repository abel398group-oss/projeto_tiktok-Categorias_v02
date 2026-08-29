/**
 * Lista categorias já representadas na BD (Produto + snapshots), só leitura.
 * Agrupa URLs do mesmo path (sem query/hash), deriva slug TikTok Shop a partir de `/c/{slug}/…`.
 */
import { Prisma } from "@prisma/client";

/**
 * @param {string} raw
 */
export function normalizeCategoryKey(raw) {
  const s = String(raw ?? "").trim();
  if (!s) {
    return "";
  }
  try {
    const url = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    const noFrag = s.split("#")[0] ?? "";
    const noQuery = noFrag.split("?")[0].trim().replace(/\/+$/, "");
    return noQuery.toLowerCase();
  }
}

/**
 * Ex.: `/br/c/womenswear-underwear/601152` → `womenswear-underwear`
 * @param {string} raw
 * @returns {string | null}
 */
export function deriveCategorySlug(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const url = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
    const m = new URL(url).pathname.match(/\/c\/([^/]+)/i);
    return m ? m[1] : null;
  } catch {
    const base = s.split("?")[0].split("#")[0];
    const m = base.match(/\/c\/([^/]+)/i);
    return m ? m[1] : null;
  }
}

/**
 * URL armazenada mais frequente no bucket; empate → ordem lexicográfica.
 * @param {{ urlSamples: Map<string, number> }} b
 */
function pickRepresentativeStored(b) {
  let bestUrl = "";
  let bestCnt = -1;
  for (const [u, c] of b.urlSamples.entries()) {
    if (c > bestCnt || (c === bestCnt && (bestUrl === "" || u.localeCompare(bestUrl) < 0))) {
      bestCnt = c;
      bestUrl = u;
    }
  }
  return bestUrl;
}

/**
 * Escolhe o run “mais recente” para métricas do cartão (`lastScrapeRunId`, contagens nesta corrida).
 * Em empate de `collected_at` (ex.: mesma resolução na BD ou JSON), usar `created_at` do run —
 * nunca preferir o id lexicograficamente menor (regressão: cartão ficava preso a um import antigo).
 * @param {Map<string, { collected: number, created: number }>} runs
 */
function pickLatestRunMeta(runs) {
  let bestId = /** @type {string | null} */ (null);
  let bestT = -1;
  let bestCreated = -1;
  for (const [id, meta] of runs) {
    const coll = meta.collected;
    const crea = meta.created;
    if (
      bestId === null ||
      coll > bestT ||
      (coll === bestT && crea > bestCreated) ||
      (coll === bestT && crea === bestCreated && id.localeCompare(/** @type {string} */ (bestId)) > 0)
    ) {
      bestId = id;
      bestT = coll;
      bestCreated = crea;
    }
  }
  return { bestId, bestCollectedMs: bestT, bestCreatedMs: bestCreated };
}

/** Janela (ms) entre `Product.first_seen_at` e `ScrapeRun.collected_at` para contar “novo nesta coleta” (alinhado ao importador). */
const NEW_PRODUCT_TIME_ALIGN_MS = 12_000;

/** Horas sem coleta para `operationalHealth = stale_collection`. */
const STALE_COLLECTION_HOURS = 72;

/**
 * @param {{
 *   lastRunStatus: string | null,
 *   lastCollectedAt: string | null,
 *   storedUrlVariantCount: number
 * }} p
 */
function computeOperationalHealth(p) {
  const st = p.lastRunStatus != null ? String(p.lastRunStatus).trim().toLowerCase() : "";
  if (st !== "" && st !== "ok") return "partial_run";
  const coll = p.lastCollectedAt ? new Date(p.lastCollectedAt).getTime() : 0;
  if (coll > 0 && Date.now() - coll > STALE_COLLECTION_HOURS * 3600 * 1000) {
    return "stale_collection";
  }
  if (p.storedUrlVariantCount > 1) return "mixed_urls";
  return "ok";
}

/**
 * Divide uma lista em blocos com tamanho máximo seguro para consultas Prisma/Postgres.
 * @template T
 * @param {T[]} items
 * @param {number} chunkSize
 * @returns {T[][]}
 */
export function chunkArray(items, chunkSize) {
  const size = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : 1;
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * @returns {Promise<{ categories: Array<{
 *   categoryUrl: string,
 *   categoryKey: string,
 *   categorySlug: string | null,
 *   totalProducts: number,
 *   lastCollectedAt: string | null,
 *   lastImportedAt: string | null,
 *   lastScrapeRunCreatedAt: string | null,
 *   lastScrapeRunId: string | null,
 *   lastImportProductCount: number | null,
 *   lastImportSellerCount: number | null,
 *   storedUrlVariantCount: number,
 *   operationalHealth: string,
 *   lastRunStatus: string | null,
 *   lastRunJsonTotal: number | null,
 *   lastRunScopeCategoryUrl: string | null,
 *   lastRunFilterNote: string | null,
 *   lastRunInputHashPreview: string | null,
 *   lastRunNewProductsApprox: number | null,
 *   lastRunUpdatedProductsApprox: number | null,
 *   jsonRunCoveragePercent: number | null
 * }> }>}
 */
export async function listImportedCategories(prisma) {
  const rows =
    /** @type {Array<{
     *   product_internal_id: string,
     *   category_url_stored: string,
     *   scrape_run_id: string | null,
     *   run_collected_at: Date | null,
     *   run_created_at: Date | null,
     *   product_last_seen_at: Date | null
     * }>} */ (
      await prisma.$queryRaw(
        /*
         * Para cada produto, os dados do run MAIS RECENTE em que ele apareceu.
         *
         * A versão anterior fazia `DISTINCT ON (p.id) ... ORDER BY p.id,
         * sr.collected_at DESC, ps.captured_at DESC`, o que obriga o Postgres a
         * ordenar o JOIN INTEIRO — 757 mil snapshots — só para depois ficar com
         * a primeira linha de cada produto. Medido em 23/08/2026: 17,9 s, com
         * "external merge Disk: 76 MB" por worker (~230 MB despejados em disco).
         * Era o pedido mais lento do painel e o que fazia a página de categoria
         * ficar em "A resolver categoria…".
         *
         * Aqui a ordenação acontece sobre os RUNS (72 linhas, não 757 mil): cada
         * run recebe uma posição, e por produto basta o MIN dessa posição, que é
         * agregação por hash em vez de sort com despejo. Mede 7,3 s — mesmas
         * 44.603 linhas, resultado idêntico (verificado por hash do conjunto).
         *
         * O desempate por `ps.captured_at` desapareceu de propósito: nenhuma
         * coluna de snapshot é devolvida por esta consulta, por isso qual dos
         * snapshots do mesmo run é escolhido não muda uma vírgula do resultado.
         */
        Prisma.sql`
WITH runs_ordenados AS (
  SELECT id, collected_at, created_at,
         row_number() OVER (
           ORDER BY collected_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS posicao
    FROM scrape_runs
), melhor_run_por_produto AS (
  SELECT ps.product_ref_id AS product_internal_id, MIN(ro.posicao) AS posicao
    FROM product_snapshots ps
    INNER JOIN runs_ordenados ro ON ro.id = ps.scrape_run_id
   GROUP BY ps.product_ref_id
)
SELECT p.id AS product_internal_id,
       btrim(p.category_url) AS category_url_stored,
       ro.id AS scrape_run_id,
       ro.collected_at AS run_collected_at,
       ro.created_at AS run_created_at,
       p.last_seen_at AS product_last_seen_at
  FROM products p
  INNER JOIN melhor_run_por_produto m ON m.product_internal_id = p.id
  INNER JOIN runs_ordenados ro ON ro.posicao = m.posicao
 WHERE p.category_url IS NOT NULL AND btrim(p.category_url) <> ''
`
      )
    );

  /** @type {Map<string, {
   * urlSamples: Map<string, number>,
   * productIds: Set<string>,
   * maxLastSeen: number,
   * runs: Map<string, { collected: number, created: number }>
   * }>} */
  const buckets = new Map();

  for (const r of rows) {
    const stored = String(r.category_url_stored ?? "").trim();
    if (!stored) continue;
    const key = normalizeCategoryKey(stored);
    if (!key) continue;

    let b = buckets.get(key);
    if (!b) {
      b = {
        urlSamples: new Map(),
        productIds: new Set(),
        maxLastSeen: 0,
        runs: new Map()
      };
      buckets.set(key, b);
    }

    b.productIds.add(r.product_internal_id);
    b.urlSamples.set(stored, (b.urlSamples.get(stored) ?? 0) + 1);

    const ls = r.product_last_seen_at ? new Date(r.product_last_seen_at).getTime() : 0;
    if (ls > b.maxLastSeen) {
      b.maxLastSeen = ls;
    }

    const rid = r.scrape_run_id;
    if (rid && r.run_collected_at) {
      const ct = new Date(r.run_collected_at).getTime();
      const cr = r.run_created_at ? new Date(r.run_created_at).getTime() : 0;
      b.runs.set(rid, { collected: ct, created: cr });
    }
  }

  const categories = [...buckets.entries()].map(([categoryKey, b]) => {
    const storedRep = pickRepresentativeStored(b);
    const categoryUrl = storedRep ? normalizeCategoryKey(storedRep) : categoryKey;
    const slug = deriveCategorySlug(storedRep || categoryUrl);

    const { bestId: lastScrapeRunId, bestCollectedMs, bestCreatedMs } = pickLatestRunMeta(b.runs);

    const lastCollectedAt =
      bestCollectedMs >= 0 ? new Date(bestCollectedMs).toISOString() : null;
    const lastImportedAt = b.maxLastSeen > 0 ? new Date(b.maxLastSeen).toISOString() : null;
    const lastScrapeRunCreatedAt = bestCreatedMs > 0 ? new Date(bestCreatedMs).toISOString() : null;

    return {
      categoryUrl,
      categoryKey,
      categorySlug: slug,
      totalProducts: b.productIds.size,
      lastCollectedAt,
      lastImportedAt,
      lastScrapeRunCreatedAt,
      lastScrapeRunId,
      storedUrlVariantCount: b.urlSamples.size,
      _productIds: [...b.productIds]
    };
  });

  categories.sort((a, b) => {
    const ta = a.lastCollectedAt ? new Date(a.lastCollectedAt).getTime() : 0;
    const tb = b.lastCollectedAt ? new Date(b.lastCollectedAt).getTime() : 0;
    return tb - ta || (b.totalProducts ?? 0) - (a.totalProducts ?? 0);
  });

  await enrichCategoriesWithImportAndSellers(prisma, categories);

  for (const c of categories) {
    if (c.operationalHealth == null) {
      c.operationalHealth = computeOperationalHealth({
        lastRunStatus: /** @type {string | null} */ (c.lastRunStatus ?? null),
        lastCollectedAt: /** @type {string | null} */ (c.lastCollectedAt ?? null),
        storedUrlVariantCount: Number(c.storedUrlVariantCount ?? 0) || 0
      });
    }
  }

  const sanitized = categories.map(({ _productIds: _discard, ...rest }) => rest);
  return { categories: sanitized };
}

/**
 * Produtos / lojas únicos apenas na última scrape run aplicável ao bucket da categoria (paralelo aos cartões na UI).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {Array<Record<string, unknown> & {
 *   lastScrapeRunId: string | null,
 *   _productIds: string[]
 * }>} categories
 */
async function enrichCategoriesWithImportAndSellers(prisma, categories) {
  const allPid = [...new Set(categories.flatMap((c) => /** @type {string[]} */ (c._productIds)))];
  const runIds = [
    ...new Set(
      categories
        .map((c) => c.lastScrapeRunId)
        .filter((x) => x != null && String(x).trim() !== "")
        .map(String)
    )
  ];

  for (const c of categories) {
    c.lastRunStatus = null;
    c.lastRunJsonTotal = null;
    c.lastRunScopeCategoryUrl = null;
    c.lastRunFilterNote = null;
    c.lastRunInputHashPreview = null;
    c.lastRunNewProductsApprox = null;
    c.lastRunUpdatedProductsApprox = null;
    c.jsonRunCoveragePercent = null;
  }

  if (allPid.length === 0) {
    for (const c of categories) {
      c.lastImportProductCount = null;
      c.lastImportSellerCount = null;
      delete c._productIds;
      c.operationalHealth = computeOperationalHealth({
        lastRunStatus: null,
        lastCollectedAt: /** @type {string | null} */ (c.lastCollectedAt ?? null),
        storedUrlVariantCount: Number(c.storedUrlVariantCount ?? 0) || 0
      });
    }
    return;
  }

  const snapshotRows = [];
  if (runIds.length > 0 && allPid.length > 0) {
    const productIdBatches = chunkArray(allPid, 1000);
    const runIdBatches = chunkArray(runIds, 500);

    for (const pidBatch of productIdBatches) {
      for (const runBatch of runIdBatches) {
        const rows = await prisma.productSnapshot.findMany({
          where: {
            scrapeRunId: { in: runBatch },
            productRefId: { in: pidBatch }
          },
          select: {
            scrapeRunId: true,
            productRefId: true,
            product: { select: { sellerRefId: true, firstSeenAt: true } }
          }
        });
        snapshotRows.push(...rows);
      }
    }
  }

  /** @type {Map<string, { status: string, totalProducts: number | null, collectedAt: Date, categoryUrl: string | null, filterDescription: string | null, inputHash: string | null }>} */
  const runMeta = new Map();
  if (runIds.length > 0) {
    const runs = await prisma.scrapeRun.findMany({
      where: { id: { in: runIds } },
      select: {
        id: true,
        status: true,
        totalProducts: true,
        collectedAt: true,
        categoryUrl: true,
        filterDescription: true,
        inputHash: true
      }
    });
    for (const r of runs) {
      const h = r.inputHash != null ? String(r.inputHash).trim() : "";
      runMeta.set(r.id, {
        status: String(r.status ?? ""),
        totalProducts: r.totalProducts != null ? Number(r.totalProducts) : null,
        collectedAt: r.collectedAt,
        categoryUrl: r.categoryUrl != null ? String(r.categoryUrl) : null,
        filterDescription: r.filterDescription != null ? String(r.filterDescription).trim() : null,
        inputHash: h !== "" ? h : null
      });
    }
  }

  for (const c of categories) {
    const pidSet = new Set(/** @type {string[]} */ (c._productIds));
    const rid = c.lastScrapeRunId != null ? String(c.lastScrapeRunId) : "";

    /** @type {number | null} */
    let lastImportProductCount = null;
    /** @type {number | null} */
    let lastImportSellerCount = null;
    const meta = rid ? runMeta.get(rid) : undefined;
    if (meta) {
      c.lastRunStatus = meta.status;
      c.lastRunJsonTotal = meta.totalProducts;
      c.lastRunScopeCategoryUrl = meta.categoryUrl;
      c.lastRunFilterNote =
        meta.filterDescription && meta.filterDescription.length > 120
          ? `${meta.filterDescription.slice(0, 117)}…`
          : meta.filterDescription;
      if (meta.inputHash) {
        c.lastRunInputHashPreview =
          meta.inputHash.length > 14 ? `${meta.inputHash.slice(0, 12)}…` : meta.inputHash;
      }
    }

    if (rid) {
      let snapN = 0;
      /** @type {Set<string>} */
      const sellerRefs = new Set();
      const collectedMs = meta ? new Date(meta.collectedAt).getTime() : 0;
      let newApprox = 0;
      for (const row of snapshotRows) {
        if (row.scrapeRunId !== rid || !pidSet.has(row.productRefId)) continue;
        snapN += 1;
        const ref = row.product?.sellerRefId;
        if (ref != null && String(ref).trim() !== "") {
          sellerRefs.add(String(ref));
        }
        const fs = row.product?.firstSeenAt;
        if (meta && fs != null && collectedMs > 0) {
          const fsMs = new Date(fs).getTime();
          if (Math.abs(fsMs - collectedMs) <= NEW_PRODUCT_TIME_ALIGN_MS) {
            newApprox += 1;
          }
        }
      }
      lastImportProductCount = snapN;
      lastImportSellerCount = sellerRefs.size;
      if (meta && snapN > 0) {
        c.lastRunNewProductsApprox = newApprox;
        c.lastRunUpdatedProductsApprox = Math.max(0, snapN - newApprox);
      }
      const jt = c.lastRunJsonTotal != null && Number.isFinite(Number(c.lastRunJsonTotal)) ? Number(c.lastRunJsonTotal) : null;
      const scope = c.lastRunScopeCategoryUrl != null ? String(c.lastRunScopeCategoryUrl).toLowerCase() : "";
      if (jt != null && jt > 0 && snapN > 0 && (scope === "multiple" || scope.includes("multi"))) {
        c.jsonRunCoveragePercent = Math.min(100, Math.round((100 * snapN) / jt));
      }
    }

    c.lastImportProductCount = lastImportProductCount;
    c.lastImportSellerCount = lastImportSellerCount;
    delete c._productIds;
  }
}
