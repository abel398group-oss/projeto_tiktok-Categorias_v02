/**
 * CLI: relatório “Produtos para Escalar” (sobre score existente).
 */
import { PrismaClient } from "@prisma/client";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";
import { getScalableProductsReport } from "./scalable-products.mjs";

const prisma = new PrismaClient();

/** @param {Awaited<ReturnType<typeof getScalableProductsReport>>["validatedToScale"][number]} row */
function printRow(row) {
  console.log(
    `  · ${row.nome} · score=${row.score} · vendas=${row.vendas} · rating=${row.rating} · decisão=${row.decision} · ${row.link}`
  );
}

async function main() {
  requireDatabaseUrl();

  const report = await getScalableProductsReport(prisma);

  if (report.message && !report.scrapeRun) {
    console.log(report.message + (String(report.message).endsWith("\n") ? "" : "\n"));
    process.exitCode = 0;
    return;
  }

  if (!report.scrapeRun) {
    console.log(report.message ?? "Sem dados.\n");
    process.exitCode = 0;
    return;
  }

  console.log("");
  console.log("🔥 VALIDADOS PARA ESCALAR\n");
  if (report.validatedToScale.length === 0) {
    console.log("  (nenhum item no top 30 do score com as regras actuais)");
  } else {
    report.validatedToScale.forEach(printRow);
  }

  console.log("");
  console.log("🟡 APOSTAS COM POTENCIAL\n");
  if (report.potentialBets.length === 0) {
    console.log("  (nenhum item no top 30 do score com as regras actuais)");
  } else {
    report.potentialBets.forEach(printRow);
  }

  console.log("");
  printSeparator();
  console.log(
    `Base: ScrapeRun ${report.scrapeRun.id} · listas derivadas do top score (máx. 30 produtos classificados pelo score v1).`
  );
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
