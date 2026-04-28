/**
 * Oportunidades heurísticas v1 — lógica partilhada CLI / API.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";

const MAX_ROWS = 20;

/** Texto público da regra (ANALYTICS v1). */
export const OPPORTUNITIES_RULE_V1_NOTE =
  "rating≥4.5, aval≥5, vendas entre 10 e 300, preço definido — heurística v1 (ver docs/ANALYTICS.md).";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getOpportunitiesReport(prisma) {
  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado."
    };
  }

  const rows = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latest.id,
      price: { not: null },
      ratingAverage: { gte: 4.5 },
      ratingTotal: { gte: 5 },
      salesCount: { gte: 10, lte: 300 }
    },
    include: {
      product: { include: { seller: true } }
    },
    orderBy: [{ ratingAverage: "desc" }, { salesCount: "desc" }],
    take: MAX_ROWS
  });

  if (rows.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      message: `Último ScrapeRun (${latest.id}): nenhum produto coincide com os filtros de oportunidade v1.`
    };
  }

  const items = rows.map((s) => ({
    productId: s.product.productId,
    nome: (s.product.name ?? "").slice(0, 40),
    loja: (s.product.seller?.name ?? "—").slice(0, 28),
    preco: s.price,
    vendas: s.salesCount,
    avalMed: s.ratingAverage,
    avalTot: s.ratingTotal,
    motivo: "regra ANALYTICS v1",
    link: s.product.productUrl ?? ""
  }));

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    ruleNote: OPPORTUNITIES_RULE_V1_NOTE,
    listed: items.length
  };
}
