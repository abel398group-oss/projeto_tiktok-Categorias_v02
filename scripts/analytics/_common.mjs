/** Partilhado pelos scripts analytics (só leitura). */
export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL não definida. Configure .env ou execute: node --env-file=.env scripts/analytics/<scripto>.mjs"
    );
    throw new Error("DATABASE_URL missing");
  }
}

/**
 * Ordenação do "último" import: `created_at` do ScrapeRun (mais recente primeiro).
 */
export async function getLatestAndPreviousRun(prisma) {
  const runs = await prisma.scrapeRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, collectedAt: true }
  });
  return { latest: runs[0] ?? null, previous: runs[1] ?? null, count: runs.length };
}

export function printSeparator() {
  console.log("─".repeat(72));
}
