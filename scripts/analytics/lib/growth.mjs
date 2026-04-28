/**
 * Crescimento de vendas último vs run anterior — lógica partilhada CLI / API.
 */
import { getLatestAndPreviousRun } from "../_common.mjs";

const TOP_LIMIT = 20;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getGrowthReport(prisma) {
  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    return {
      latestRun: null,
      previousRun: null,
      items: [],
      message: "Sem dados: nenhum ScrapeRun encontrado."
    };
  }

  if (count < 2 || !previous) {
    return {
      latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: null,
      items: [],
      message: "É necessário ter pelo menos 2 ScrapeRuns para calcular crescimento."
    };
  }

  const prevSnaps = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: previous.id,
      salesCount: { not: null }
    },
    select: {
      productRefId: true,
      salesCount: true
    }
  });
  const prevByProd = new Map(prevSnaps.map((s) => [s.productRefId, s.salesCount]));

  const latestSnaps = await prisma.productSnapshot.findMany({
    where: {
      scrapeRunId: latest.id,
      salesCount: { not: null }
    },
    include: {
      product: { include: { seller: true } }
    }
  });

  /** @type {Array<{delta: number, deltaPctLabel: string, s: (typeof latestSnaps)[number], prevSales: number}>} */
  const pairs = [];

  for (const s of latestSnaps) {
    const pv = prevByProd.get(s.productRefId);
    if (pv == null || s.salesCount == null) continue;
    let deltaPctLabel;
    if (pv === 0) {
      deltaPctLabel = s.salesCount > pv ? "∞" : "—";
    } else {
      deltaPctLabel = `${(((s.salesCount - pv) / pv) * 100).toFixed(1)}%`;
    }
    pairs.push({ delta: s.salesCount - pv, deltaPctLabel, s, prevSales: pv });
  }

  pairs.sort((a, b) => b.delta - a.delta);

  const slice = pairs.slice(0, TOP_LIMIT);

  if (slice.length === 0) {
    return {
      latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
      previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
      items: [],
      message:
        "Sem pares comparáveis: nenhum produto com vendas não nulas no último e no run anterior (ou apenas um run com dados)."
    };
  }

  const items = slice.map(({ s, prevSales, delta, deltaPctLabel }) => ({
    productId: s.product.productId,
    nome: (s.product.name ?? "").slice(0, 38),
    loja: (s.product.seller?.name ?? "—").slice(0, 24),
    vendasAnt: prevSales,
    vendasAtual: s.salesCount,
    delta,
    deltaPct: deltaPctLabel,
    link: s.product.productUrl ?? ""
  }));

  return {
    latestRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    previousRun: { id: previous.id, collectedAt: previous.collectedAt.toISOString() },
    items,
    sortNote: "ordenação por maior delta absoluto de vendas",
    listed: items.length,
    maxRows: TOP_LIMIT
  };
}
