/**
 * Crescimento de vendas entre o último ScrapeRun e o anterior (leitura apenas).
 */
import { PrismaClient } from "@prisma/client";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";
import { getGrowthReport } from "./lib/growth.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const report = await getGrowthReport(prisma);

  if (report.message && (!report.items || report.items.length === 0)) {
    console.log(report.message);
    if (report.latestRun && report.previousRun) {
      console.log("");
      printSeparator();
      console.log(
        `Runs: anterior=${report.previousRun.id.slice(0, 8)}… | último=${report.latestRun.id.slice(0, 8)}…`
      );
    }
    process.exitCode = 0;
  } else {
    console.log("Maior crescimento absoluto de vendas (entre os dois últimos ScrapeRuns)\n");
    console.log(`Run anterior: ${report.previousRun.id} | ${report.previousRun.collectedAt}`);
    console.log(`Run último:   ${report.latestRun.id} | ${report.latestRun.collectedAt}\n`);
    printSeparator();
    console.table(report.items);
    printSeparator();
    console.log(`Listados: ${report.items.length} (máx. ${report.maxRows}, ordenação por maior delta absoluto).\n`);
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
