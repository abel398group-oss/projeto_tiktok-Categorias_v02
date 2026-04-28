/**
 * Produtos "novos" relativamente ao último ScrapeRun:
 * - primeiro ProductSnapshot (min captured_at) pertence ao último run, OU
 * - Product.firstSeenAt coincide com collectedAt do último run (criados nessa importação).
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
    /** @type {Set<string>} */
    const ids = new Set();

    const fromFirstSnap = await prisma.$queryRaw`
      SELECT DISTINCT ps.product_ref_id AS pid
      FROM product_snapshots ps
      INNER JOIN (
        SELECT product_ref_id, MIN(captured_at) AS min_ca
        FROM product_snapshots
        GROUP BY product_ref_id
      ) m ON m.product_ref_id = ps.product_ref_id AND ps.captured_at = m.min_ca
      WHERE ps.scrape_run_id = ${latest.id}
    `;

    for (const r of fromFirstSnap) {
      ids.add(r.pid);
    }

    const fromFirstSeen = await prisma.product.findMany({
      where: { firstSeenAt: latest.collectedAt },
      select: { id: true }
    });
    for (const p of fromFirstSeen) {
      ids.add(p.id);
    }

    if (ids.size === 0) {
      console.log(
        `Último ScrapeRun (${latest.id}): nenhum produto novo pelos critérios (primeiro snapshot ou firstSeenAt).`
      );
      process.exitCode = 0;
    } else {
      const snaps = await prisma.productSnapshot.findMany({
        where: {
          scrapeRunId: latest.id,
          productRefId: { in: [...ids] }
        },
        include: {
          product: { include: { seller: true } }
        }
      });

      const byPid = new Map(snaps.map((s) => [s.product.productId, s]));

      const table = [...byPid.entries()].map(([productId, s]) => ({
        productId,
        nome: (s.product.name ?? "").slice(0, 48),
        loja: (s.product.seller?.name ?? "—").slice(0, 32),
        preco: s.price ?? "",
        vendas: s.salesCount ?? "",
        avaliacao: s.ratingAverage != null ? String(s.ratingAverage) : "",
        link: s.product.productUrl ?? ""
      }));

      console.log('Produtos "novos" no último ScrapeRun\n');
      console.log(`ScrapeRun: ${latest.id} | collectedAt: ${latest.collectedAt.toISOString()}`);
      console.log("(critério: primeiro snapshot neste run e/ou firstSeenAt igual a esta coleta)\n");
      printSeparator();
      console.table(table);
      printSeparator();
      console.log(`Total: ${table.length}\n`);
    }
  }
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
