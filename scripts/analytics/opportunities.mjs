/**
 * Oportunidades heurísticas simples no último ScrapeRun (leitura apenas).
 * Regra v1: rating alto, avaliações mínimas, vendas médias-alguma tração, preço definido.
 */
import { PrismaClient } from "@prisma/client";
import { getLatestAndPreviousRun, printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    console.log("Sem dados: nenhum ScrapeRun encontrado.");
    process.exitCode = 0;
  } else {
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
      take: 20
    });

    if (rows.length === 0) {
      console.log(
        `Último ScrapeRun (${latest.id}): nenhum produto coincide com os filtros de oportunidade v1.\n`
      );
      process.exitCode = 0;
    } else {
      console.log("Possíveis oportunidades comerciais (heurística v1)\n");
      console.log(`ScrapeRun: ${latest.id} | collectedAt: ${latest.collectedAt.toISOString()}\n`);
      printSeparator();

      const MOTIVO =
        "rating≥4.5, aval≥5, vendas entre 10 e 300, preço definido — heurística v1 (ver docs/ANALYTICS.md).";

      const table = rows.map((s) => ({
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

      console.table(table);
      printSeparator();
      console.log(MOTIVO);
      console.log(`\nTotal: ${rows.length}\n`);
    }
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
