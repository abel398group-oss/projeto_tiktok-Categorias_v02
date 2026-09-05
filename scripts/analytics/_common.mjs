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
 * Só a linha mais recente não chega: um import interrompido a meio (máquina
 * dormiu, enriquecimento cortado) cria um ScrapeRun de verdade mas com ZERO
 * ProductSnapshot — e "mais recente por created_at" escolhe esse fantasma na
 * frente de um run com 20 mil produtos. Aconteceu de verdade em 21/08/2026
 * (dois runs vazios criados às 00:23, cortando o ranking inteiro). "Último
 * run" tem de significar "último run com dado", não "última linha da tabela".
 */
const TEM_SNAPSHOT = { productSnapshots: { some: {} } };

/**
 * Fracção de `totalProducts` que um run precisa de ter gravada para contar como
 * coleta COMPLETA.
 *
 * "Ter pelo menos um snapshot" (TEM_SNAPSHOT) não chega: o import cria o
 * ScrapeRun e depois insere os ~21 mil snapshots um a um, durante mais de uma
 * hora. Nesse intervalo o run já existe, já tem linhas, e é o mais recente —
 * por isso era escolhido como "último run" a meio da escrita. Medido em
 * 04/09/2026: o painel mostrou 17.139 produtos (depois 9.560) em vez de 20.972,
 * sem qualquer aviso, enquanto o import corria; e um import interrompido às
 * 18:20 deixou um run com 1.795 linhas que seria "o último" até haver outro.
 *
 * `totalProducts` é gravado logo na criação do run, a partir do JSON — é a
 * medida do que o import PRETENDE escrever. 90% e não 100%: linhas sem
 * product_id são saltadas de propósito no import (contam no JSON, não na base).
 */
export const FRACCAO_MINIMA_RUN_COMPLETO = 0.9;

/**
 * Ids dos runs completos, do mais recente para o mais antigo.
 *
 * SQL cru porque o Prisma não sabe comparar `count(snapshots)` com uma coluna
 * do próprio run no `where`. Custa ~1,1 s (index-only scan sobre 1,36 M
 * snapshots) — quem chama a partir da API deve estar atrás do cache de
 * relatórios, que já guarda o id do run com TTL curto.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ take?: number, ateCollectedAt?: Date }} [opts]
 * @returns {Promise<Array<{ id: string, collectedAt: Date }>>}
 */
export async function runsCompletos(prisma, opts = {}) {
  const take = Number.isFinite(opts.take) ? Math.max(1, Math.floor(opts.take)) : 12;
  const ate = opts.ateCollectedAt instanceof Date ? opts.ateCollectedAt : null;
  // Conta só os runs candidatos, um a um pelo índice `scrape_run_id`, em vez de
  // agrupar a tabela inteira: a versão com `group by` sobre 1,36 M snapshots
  // custava 1,1 s por chamada e, como isto corre a cada validação do cache,
  // fazia cada pedido "quente" pagar esse segundo (medido: categories 15 ms → 1,45 s).
  // Olhar para 3x `take` runs chega: os parciais são a excepção, não a regra.
  const janela = Math.max(take * 3, 12);
  /** @type {Array<{ id: string, collected_at: Date, total_products: number | null, n: number }>} */
  const rows = await prisma.$queryRawUnsafe(
    `select r.id, r.collected_at, r.total_products,
            (select count(*)::int from product_snapshots s where s.scrape_run_id = r.id) as n
       from scrape_runs r
      ${ate ? "where r.collected_at <= $2" : ""}
      order by r.created_at desc
      limit $1`,
    janela,
    ...(ate ? [ate] : [])
  );
  return rows
    .filter((r) => r.n >= Math.max(1, FRACCAO_MINIMA_RUN_COMPLETO * (r.total_products ?? 1)))
    .slice(0, take)
    .map((r) => ({ id: r.id, collectedAt: r.collected_at }));
}

/**
 * Ordenação do "último" import: `created_at` do ScrapeRun (mais recente primeiro),
 * só entre os que têm pelo menos um ProductSnapshot.
 */
export async function getLatestAndPreviousRun(prisma) {
  // Só runs COMPLETOS — ver `runsCompletos`. Um import a meio não é "o último run".
  const runs = await runsCompletos(prisma, { take: 2 });
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
  const [latest] = await runsCompletos(prisma, { take: 1 });
  if (!latest) return { latest: null, baseline: null, janelaHoras: null, minHoras };

  const limite = new Date(new Date(latest.collectedAt).getTime() - minHoras * 3600 * 1000);
  // Também só entre runs completos: comparar vendas com um run pela metade
  // inventaria "quedas" em todos os produtos que ele ainda não tinha gravado.
  const candidatos = await runsCompletos(prisma, { take: 200, ateCollectedAt: limite });
  candidatos.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  const baseline = candidatos[0] ?? null;

  const janelaHoras = baseline
    ? (new Date(latest.collectedAt).getTime() - new Date(baseline.collectedAt).getTime()) / 3600000
    : null;

  return { latest, baseline, janelaHoras, minHoras };
}

export function printSeparator() {
  console.log("─".repeat(72));
}
