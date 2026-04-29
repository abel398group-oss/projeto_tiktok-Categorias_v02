/**
 * CLI: Mapa de categoria (hierárquico: master → sub → top produtos).
 */
import { PrismaClient } from "@prisma/client";
import { printSeparator, requireDatabaseUrl } from "./_common.mjs";
import { getCategoryMapReport } from "./category-map.mjs";

const prisma = new PrismaClient();

async function main() {
  requireDatabaseUrl();

  const report = await getCategoryMapReport(prisma);

  if (report.masterCategories?.length === 0 && report.message) {
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

  for (const m of report.masterCategories) {
    console.log("");
    console.log(`🔥 ${m.name}`);
    console.log("");

    m.subcategories.forEach((sub, idx) => {
      console.log(
        `   ${idx + 1}. ${sub.name} (score: ${sub.score}, ${sub.classification}) · produtos=${sub.totalProducts} · vendas Σ=${sub.totalSales} · oport.=${sub.opportunities}`
      );

      sub.topProducts.forEach((p) => {
        const preço = p["preço"];
        const rp = preço != null ? ` · preço=${preço}` : "";
        const dr = p.delta != null ? ` · Δvendas=${p.delta}` : "";
        const rt = p.rating != null ? ` · rating=${p.rating}` : "";
        console.log(`      · ${p.nome} (score ${p.score}${rt} · vendas=${p.vendas}${rp}${dr})`);
      });
    });
  }

  console.log("");
  printSeparator();
  console.log(
    `Base: ScrapeRun ${report.scrapeRun.id} (${report.scrapeRun.collectedAt}) · top ${report.topProductsPerSubcategory ?? "?"} por subcategoria.`
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
