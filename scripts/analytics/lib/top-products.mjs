/**
 * Top produtos por salesCount no último ScrapeRun — lógica partilhada CLI / API.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";

const MAX_ROWS = 20;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getTopProductsReport(prisma) {
  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      scrapeRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado. Importa primeiro (npm run db:import:output)."
    };
  }

  const rows = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latest.id,
      salesCount: { not: null }
    },
    include: {
      product: { include: { seller: true } }
    },
    orderBy: { salesCount: "desc" },
    take: MAX_ROWS
  });

  if (rows.length === 0) {
    return {
      scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      items: [],
      message: `Último ScrapeRun (${latest.id}): nenhum snapshot com sales_count.`
    };
  }

  const items = rows.map((s) => ({
    productId: s.product.productId,
    nome: (s.product.name ?? "").trim() || "—",
    loja: (s.product.seller?.name ?? "").trim() || "—",
    preco: s.price,
    vendas: s.salesCount,
    avaliacao: s.ratingAverage != null ? s.ratingAverage : null,
    link: s.product.productUrl ?? ""
  }));

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    items,
    listed: items.length,
    maxRows: MAX_ROWS
  };
}
