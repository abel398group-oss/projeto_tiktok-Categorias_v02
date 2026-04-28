/**
 * Produtos "novos" relativamente ao último ScrapeRun.
 */
import { PrismaClient } from "@prisma/client";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";
import { getNewProductsReport } from "./lib/new-products.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const report = await getNewProductsReport(prisma);

  if (report.message && (!report.items || report.items.length === 0)) {
    console.log(report.message);
    process.exitCode = 0;
  } else {
    console.log('Produtos "novos" no último ScrapeRun\n');
    console.log(`ScrapeRun: ${report.scrapeRun.id} | collectedAt: ${report.scrapeRun.collectedAt}`);
    console.log(`(${report.criterionNote})\n`);
    printSeparator();
    console.table(report.items);
    printSeparator();
    console.log(`Total: ${report.items.length}\n`);
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
