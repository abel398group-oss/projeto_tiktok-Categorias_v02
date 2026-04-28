/**
 * Crescimento de vendas entre o último ScrapeRun e o anterior (leitura apenas).
 * Ignora pares onde falta salesCount num dos dois snapshots.
 */
import { PrismaClient } from "@prisma/client";
import { getLatestAndPreviousRun, printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    console.log("Sem dados: nenhum ScrapeRun encontrado.");
    process.exitCode = 0;
  } else if (count < 2 || !previous) {
    console.log("É necessário ter pelo menos 2 ScrapeRuns para calcular crescimento.");
    process.exitCode = 0;
  } else {
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
      const delta = s.salesCount - pv;
      let deltaPctLabel;
      if (pv === 0) {
        deltaPctLabel = s.salesCount > pv ? "∞" : "—";
      } else {
        deltaPctLabel = `${(((s.salesCount - pv) / pv) * 100).toFixed(1)}%`;
      }
      pairs.push({ delta, deltaPctLabel, s, prevSales: pv });
    }

    pairs.sort((a, b) => b.delta - a.delta);

    const top = pairs.slice(0, 20);

    if (top.length === 0) {
      console.log(
        "Sem pares comparáveis: nenhum produto com vendas não nulas no último e no run anterior (ou apenas um run com dados)."
      );
      printSeparator();
      console.log(`Runs: anterior=${previous.id.slice(0, 8)}… | último=${latest.id.slice(0, 8)}…`);
      process.exitCode = 0;
    } else {
      console.log("Maior crescimento absoluto de vendas (entre os dois últimos ScrapeRuns)\n");
      console.log(`Run anterior: ${previous.id} | ${previous.collectedAt.toISOString()}`);
      console.log(`Run último:   ${latest.id} | ${latest.collectedAt.toISOString()}\n`);
      printSeparator();

      const table = top.map(({ s, prevSales, delta, deltaPctLabel }) => ({
        productId: s.product.productId,
        nome: (s.product.name ?? "").slice(0, 38),
        loja: (s.product.seller?.name ?? "—").slice(0, 24),
        vendasAnt: prevSales,
        vendasAtual: s.salesCount,
        delta,
        deltaPct: deltaPctLabel,
        link: s.product.productUrl ?? ""
      }));

      console.table(table);
      printSeparator();
      console.log(`Listados: ${top.length} (máx. 20, ordenação por maior delta absoluto).\n`);
    }
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
