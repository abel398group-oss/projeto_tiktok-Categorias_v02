/**
 * CLI: interpretação comercial sobre o top do product-score (não grava na BD).
 */
import { PrismaClient } from "@prisma/client";
import { getProductScoreReport } from "./lib/product-score.mjs";
import { analyzeProducts } from "./product-decision.mjs";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

try {
  requireDatabaseUrl();

  const report = await getProductScoreReport(prisma);

  if (report.message || !report.top || report.top.length === 0) {
    console.log(report.message ?? "Sem dados no último run.");
    process.exitCode = 0;
  } else {
    const analysed = analyzeProducts(report.top);

    console.log(
      "Interpretação comercial v1 (sobre o product-score já calculado)\nScrapeRun:",
      report.scrapeRun?.id ?? "—",
      "|",
      report.scrapeRun?.collectedAt ?? ""
    );
    console.log("");

    for (const row of analysed) {
      printSeparator();
      console.log(`productId: ${row.productId} | score: ${row.scoreSnapshot}`);
      console.log(`decisão: ${row.decision} | confiança: ${row.confidence}/100`);
      console.log(`resumo: ${row.summary}`);
      console.log("");
      console.log("análise:", row.analysis);
      console.log("");
      console.log("motivos:", row.reasons.length ? row.reasons.join(" · ") : "—");
      console.log("riscos:", row.risks.length ? row.risks.join(" · ") : "—");
      console.log("oportunidade:", row.opportunity);
      console.log("");
    }

    printSeparator();
    console.log(`Linhas interpretadas: ${analysed.length} (dos ${report.top.length} do top por score).\n`);
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
