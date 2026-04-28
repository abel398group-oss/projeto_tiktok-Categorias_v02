/**
 * Top produtos por salesCount no último ScrapeRun (leitura apenas).
 */
import { PrismaClient } from "@prisma/client";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";
import { getTopProductsReport } from "./lib/top-products.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const report = await getTopProductsReport(prisma);

  if ((!report.items || report.items.length === 0) && report.message) {
    console.log(report.message);
    process.exitCode = 0;
  } else if (!report.items || report.items.length === 0) {
    console.log("Sem dados a listar.");
    process.exitCode = 0;
  } else {
    console.log("Top produtos por vendas (último ScrapeRun)\n");
    console.log(
      `ScrapeRun: ${report.scrapeRun.id} | collectedAt: ${report.scrapeRun.collectedAt}\n`
    );
    printSeparator();
    console.table(report.items);
    printSeparator();
    console.log(`Total listado: ${report.items.length} (máx. ${report.maxRows ?? 20})\n`);
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
