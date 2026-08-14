/** Partilhado pelos scripts analytics (só leitura). */
export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL não definida. Copie .env.example → .env (npm run setup:local) e defina DATABASE_URL."
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

/**
 * Distância mínima entre duas coletas para a diferença de vendas dizer alguma coisa.
 *
 * Medido nesta base: coletas seguidas ficam a 2–4 minutos umas das outras (a
 * mesma coleta completa reimportada, ou execuções encavalitadas). Comparar o
 * contador de vendas com 2 minutos de intervalo devolve zero para toda a gente
 * — não porque ninguém vende, mas porque não houve tempo para vender. Era isso
 * que fazia `deltaVendas` mostrar "0" em quase todos os produtos.
 *
 * 12 h é o menor intervalo em que um produto com giro real se distingue de um
 * parado sem exigir esperar uma semana pela primeira leitura útil.
 */
export const HORAS_MINIMAS_PARA_CRESCIMENTO = 12;

/**
 * Último run + o run mais recente que esteja suficientemente atrás dele para a
 * comparação de vendas fazer sentido.
 *
 * Devolve `baseline: null` quando ainda não há histórico com essa distância —
 * caso legítimo numa base nova, e que deve aparecer como "sem base" em vez de
 * virar um crescimento de zero.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ minHoras?: number }} [opts]
 */
export async function getLatestAndBaselineRun(prisma, opts = {}) {
  const minHoras = Number.isFinite(opts.minHoras) ? Number(opts.minHoras) : HORAS_MINIMAS_PARA_CRESCIMENTO;
  const latest = await prisma.scrapeRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, collectedAt: true }
  });
  if (!latest) return { latest: null, baseline: null, janelaHoras: null, minHoras };

  const limite = new Date(new Date(latest.collectedAt).getTime() - minHoras * 3600 * 1000);
  const baseline = await prisma.scrapeRun.findFirst({
    where: { collectedAt: { lte: limite } },
    orderBy: { collectedAt: "desc" },
    select: { id: true, collectedAt: true }
  });

  const janelaHoras = baseline
    ? (new Date(latest.collectedAt).getTime() - new Date(baseline.collectedAt).getTime()) / 3600000
    : null;

  return { latest, baseline, janelaHoras, minHoras };
}

export function printSeparator() {
  console.log("─".repeat(72));
}
