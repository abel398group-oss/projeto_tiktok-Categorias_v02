/**
 * Produtos novos no último run — lógica partilhada CLI / API.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getNewProductsReport(prisma) {
  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message:
        "Sem dados: nenhum ScrapeRun encontrado. Importa primeiro (npm run db:import:output)."
    };
  }

  /** @type {Set<string>} */
  const ids = new Set();

  const fromFirstSnap = await prisma.$queryRaw`
    SELECT DISTINCT ps.product_ref_id AS pid
    FROM product_snapshots ps
    INNER JOIN (
      SELECT product_ref_id, MIN(captured_at) AS min_ca
      FROM product_snapshots
      GROUP BY product_ref_id
    ) m ON m.product_ref_id = ps.product_ref_id AND ps.captured_at = m.min_ca
    WHERE ps.scrape_run_id = ${latest.id}
  `;

  for (const r of fromFirstSnap) {
    ids.add(r.pid);
  }

  const fromFirstSeen = await prisma.product.findMany({
    where: { firstSeenAt: latest.collectedAt },
    select: { id: true }
  });
  for (const p of fromFirstSeen) {
    ids.add(p.id);
  }

  if (ids.size === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      message:
        `Último ScrapeRun (${latest.id}): nenhum produto novo pelos critérios (primeiro snapshot ou firstSeenAt).`
    };
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latest.id,
      productRefId: { in: [...ids] }
    },
    include: {
      product: { include: { seller: true } }
    }
  });

  const byPid = new Map(snaps.map((s) => [s.product.productId, s]));

  const items = [...byPid.entries()].map(([productId, s]) => ({
    productId,
    nome: (s.product.name ?? "").slice(0, 48),
    loja: (s.product.seller?.name ?? "—").slice(0, 32),
    preco: s.price ?? "",
    vendas: s.salesCount ?? "",
    avaliacao: s.ratingAverage != null ? String(s.ratingAverage) : "",
    link: s.product.productUrl ?? ""
  }));

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    criterionNote: "critério: primeiro snapshot neste run e/ou firstSeenAt igual a esta coleta",
    items,
    listed: items.length
  };
}
