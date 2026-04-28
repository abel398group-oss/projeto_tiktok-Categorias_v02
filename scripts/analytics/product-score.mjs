/**
 * Score de produto v1 — heurística 0–100 (só leitura; não persistido na base).
 */
import { PrismaClient } from "@prisma/client";
import { getProductScoreReport } from "./lib/product-score.mjs";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

async function main() {
  requireDatabaseUrl();

  const report = await getProductScoreReport(prisma);

  if (report.message && (!report.top || report.top.length === 0)) {
    console.log(report.message + (report.message.endsWith("\n") ? "" : "\n"));
    process.exitCode = 0;
    return;
  }

  console.log("Score de produto v1 (0–100, só leitura; não gravado)\n");
  console.log(`Último ScrapeRun: ${report.scrapeRun.id} | collectedAt: ${report.scrapeRun.collectedAt}`);
  console.log(
    report.hasGrowthComparableRuns && report.previousRun
      ? `Run anterior (crescimento): ${report.previousRun.id}`
      : "Um único run — crescimento = 0 (sem comparável)."
  );

  console.log("");
  printSeparator();
  console.table(
    report.top.map((r, i) => ({
      idx: i + 1,
      score: r.score,
      classific: r.classific,
      productId: r.productId,
      nome: r.nome,
      loja: r.loja,
      preco: r.preco,
      vendas: r.vendas,
      rating: r.rating,
      deltaV: r.deltaVendas,
      motivos: r.motivos.slice(0, 90) + (r.motivos.length > 90 ? "…" : "")
    }))
  );

  console.log("");
  console.log("Links (top 30, completos — um por linha):");
  report.top.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. score=${String(r.score).padStart(3)} :: ${r.link}`);
  });

  printSeparator();
  console.log(`Listados: ${report.top.length} (máximo ${report.maxListed}) de ${report.totalSnapshotsInLatestRun} snapshots no último run.`);
  console.log(`Faixas: ${report.noteFaixas}`);
  console.log("");
}

try {
  await main();
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
