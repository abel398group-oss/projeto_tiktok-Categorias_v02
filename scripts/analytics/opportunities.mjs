/**
 * Oportunidades heurísticas simples no último ScrapeRun (leitura apenas).
 */
import { PrismaClient } from "@prisma/client";
import { OPPORTUNITIES_RULE_V1_NOTE, getOpportunitiesReport } from "./lib/opportunities.mjs";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const report = await getOpportunitiesReport(prisma);

  if (report.message && (!report.items || report.items.length === 0)) {
    console.log(report.message + "\n");
    process.exitCode = 0;
  } else {
    console.log("Possíveis oportunidades comerciais (heurística v1)\n");
    console.log(
      `ScrapeRun: ${report.scrapeRun.id} | collectedAt: ${report.scrapeRun.collectedAt}\n`
    );
    printSeparator();
    console.table(report.items);
    printSeparator();
    console.log(OPPORTUNITIES_RULE_V1_NOTE);
    console.log(`\nTotal: ${report.items.length}\n`);
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
