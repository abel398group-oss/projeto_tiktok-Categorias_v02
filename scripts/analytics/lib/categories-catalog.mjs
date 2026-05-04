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
 * @param {Map<string, { collected: number, created: number }>} runs
 */
function pickLatestRunMeta(runs) {
  let bestId = /** @type {string | null} */ (null);
  let bestT = -1;
  let bestCreated = 0;
  for (const [id, meta] of runs) {
    if (
      bestId === null ||
      meta.collected > bestT ||
      (meta.collected === bestT && id < /** @type {string} */ (bestId))
    ) {
      bestId = id;
      bestT = meta.collected;
      bestCreated = meta.created;
    }
  }
  return { bestId, bestCollectedMs: bestT, bestCreatedMs: bestCreated };
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
 *   lastImportSellerCount: number | null
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
        Prisma.sql`
WITH per_product AS (
  SELECT DISTINCT ON (p.id)
    p.id AS product_internal_id,
    btrim(p.category_url) AS category_url_stored,
    sr.id AS scrape_run_id,
    sr.collected_at AS run_collected_at,
    sr.created_at AS run_created_at,
    p.last_seen_at AS product_last_seen_at
  FROM products p
  INNER JOIN product_snapshots ps ON ps.product_ref_id = p.id
  INNER JOIN scrape_runs sr ON sr.id = ps.scrape_run_id
  WHERE p.category_url IS NOT NULL AND btrim(p.category_url) <> ''
  ORDER BY p.id, sr.collected_at DESC NULLS LAST, ps.captured_at DESC NULLS LAST
)
SELECT * FROM per_product
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
      _productIds: [...b.productIds]
    };
  });

  categories.sort((a, b) => {
    const ta = a.lastCollectedAt ? new Date(a.lastCollectedAt).getTime() : 0;
    const tb = b.lastCollectedAt ? new Date(b.lastCollectedAt).getTime() : 0;
    return tb - ta || (b.totalProducts ?? 0) - (a.totalProducts ?? 0);
  });

  await enrichCategoriesWithImportAndSellers(prisma, categories);

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

  if (allPid.length === 0) {
    for (const c of categories) {
      c.lastImportProductCount = null;
      c.lastImportSellerCount = null;
      delete c._productIds;
    }
    return;
  }

  const snapshotRows =
    runIds.length > 0
      ? await prisma.productSnapshot.findMany({
          where: {
            scrapeRunId: { in: runIds },
            productRefId: { in: allPid }
          },
          select: {
            scrapeRunId: true,
            productRefId: true,
            product: { select: { sellerRefId: true } }
          }
        })
      : [];

  for (const c of categories) {
    const pidSet = new Set(/** @type {string[]} */ (c._productIds));
    const rid = c.lastScrapeRunId != null ? String(c.lastScrapeRunId) : "";

    /** @type {number | null} */
    let lastImportProductCount = null;
    /** @type {number | null} */
    let lastImportSellerCount = null;
    if (rid) {
      let snapN = 0;
      /** @type {Set<string>} */
      const sellerRefs = new Set();
      for (const row of snapshotRows) {
        if (row.scrapeRunId !== rid || !pidSet.has(row.productRefId)) continue;
        snapN += 1;
        const ref = row.product?.sellerRefId;
        if (ref != null && String(ref).trim() !== "") {
          sellerRefs.add(String(ref));
        }
      }
      lastImportProductCount = snapN;
      lastImportSellerCount = sellerRefs.size;
    }

    c.lastImportProductCount = lastImportProductCount;
    c.lastImportSellerCount = lastImportSellerCount;
    delete c._productIds;
  }
}
