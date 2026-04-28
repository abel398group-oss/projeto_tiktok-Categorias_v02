/**
 * Top produtos por salesCount no último ScrapeRun (leitura apenas).
 */
import { PrismaClient } from "@prisma/client";
import { getLatestAndPreviousRun, printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const { latest } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    console.log("Sem dados: nenhum ScrapeRun encontrado. Importa primeiro (npm run db:import:output).");
    process.exitCode = 0;
  } else {
    const rows = await prisma.productSnapshot.findMany({
      where: {
        scrapeRunId: latest.id,
        salesCount: { not: null }
      },
      include: {
        product: { include: { seller: true } }
      },
      orderBy: { salesCount: "desc" },
      take: 20
    });

    if (rows.length === 0) {
      console.log(`Último ScrapeRun (${latest.id}): nenhum snapshot com sales_count.`);
      process.exitCode = 0;
    } else {
      console.log("Top produtos por vendas (último ScrapeRun)\n");
      console.log(`ScrapeRun: ${latest.id} | collectedAt: ${latest.collectedAt.toISOString()}\n`);
      printSeparator();

      const table = rows.map((s) => ({
        productId: s.product.productId,
        nome: (s.product.name ?? "").slice(0, 48),
        loja: (s.product.seller?.name ?? "—").slice(0, 32),
        preco: s.price ?? "",
        vendas: s.salesCount,
        avaliacao: s.ratingAverage != null ? String(s.ratingAverage) : "",
        link: s.product.productUrl ?? ""
      }));

      console.table(table);
      printSeparator();
      console.log(`Total listado: ${rows.length} (máx. 20)\n`);
    }
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
