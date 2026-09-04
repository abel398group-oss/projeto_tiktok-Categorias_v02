/**
 * Remove ScrapeRuns duplicados, guardando UM run por dia.
 *
 * PORQUE EXISTE: medido em 04/09/2026, a base tinha 93 runs em 21 dias — até 12
 * no mesmo dia, a minutos uns dos outros, cada um com ~21 mil snapshots do mesmo
 * catálogo. 1,16 M snapshots e 1,1 GB para 21 dias de informação real.
 *
 * PORQUE UM POR DIA e não "os N mais recentes": `getLatestAndBaselineRun` exige
 * um run pelo menos 12 h atrás do último para dizer que houve crescimento, e o
 * `delta_7d` compara com ~7 dias atrás. Guardar "os 10 mais recentes" deixaria
 * só runs do próprio dia e faria o crescimento e o delta_7d passarem a "sem
 * base" — apagaria a série temporal, que é a única coisa que uma recoleta NÃO
 * recupera. Um por dia mantém os 21 dias e larga só as repetições.
 *
 * O run guardado de cada dia é o que tem MAIS snapshots (desempate: o mais
 * recente). Não é "o último do dia": um import interrompido a meio cria um run
 * verdadeiro mas incompleto, e ficar com esse em vez do completo seria trocar o
 * dia inteiro por um pedaço dele.
 *
 * HOJE É POUPADO POR OMISSÃO: pode haver import a escrever neste momento, e
 * apagar por baixo de um import a decorrer é pedir sarilhos. Com as importações
 * paradas isso deixa de valer — e hoje é precisamente onde as duplicatas se
 * acumulam (medido em 04/09/2026: 15 coletas no mesmo dia, todas com as mesmas
 * ~20.971 linhas). Use `--incluir-hoje` DEPOIS de parar os imports.
 *
 * Uso:
 *   node scripts/db-limpar-runs.mjs                        # só mostra o plano
 *   node scripts/db-limpar-runs.mjs --apply                # apaga (poupa hoje)
 *   node scripts/db-limpar-runs.mjs --apply --incluir-hoje # apaga hoje também
 *
 * Faça `node scripts/db-backup.mjs` antes de `--apply`. Apagar é definitivo:
 * `product_snapshots`, `seller_snapshots` e `raw_payloads` caem por CASCADE.
 */
import { PrismaClient } from "@prisma/client";

const APLICAR = process.argv.includes("--apply");
const INCLUIR_HOJE = process.argv.includes("--incluir-hoje");
const prisma = new PrismaClient();

/** Runs a apagar, com o dia a que pertencem — para o relatório fazer sentido. */
async function planear() {
  return prisma.$queryRawUnsafe(`
    with contagem as (
      select r.id, r.collected_at, r.created_at, count(s.id)::int n
      from scrape_runs r
      left join product_snapshots s on s.scrape_run_id = r.id
      group by r.id, r.collected_at, r.created_at
    ),
    ranked as (
      select *, row_number() over (
        partition by collected_at::date
        order by n desc, created_at desc
      ) rk
      from contagem
    )
    select id, collected_at::date::text dia, n
    from ranked
    where rk > 1 ${INCLUIR_HOJE ? "" : "and collected_at::date <> current_date"}
    order by dia, n desc`);
}

const aApagar = await planear();

if (aApagar.length === 0) {
  console.log("Nada a fazer: já há no máximo um run por dia (fora hoje).");
  await prisma.$disconnect();
  process.exit(0);
}

const totalSnaps = aApagar.reduce((acc, r) => acc + r.n, 0);
const dias = new Set(aApagar.map((r) => r.dia));

const [{ runs_total, snaps_total }] = await prisma.$queryRawUnsafe(
  `select (select count(*)::int from scrape_runs) runs_total,
          (select count(*)::int from product_snapshots) snaps_total`
);

console.log(`Base agora        : ${runs_total} runs, ${snaps_total.toLocaleString("pt-PT")} snapshots`);
console.log(`A apagar          : ${aApagar.length} runs, ${totalSnaps.toLocaleString("pt-PT")} snapshots`);
console.log(`Runs que sobram   : ${runs_total - aApagar.length}`);
console.log(`Dias afectados    : ${dias.size} (cada um mantém o seu melhor run)`);
console.log(`Hoje              : ${INCLUIR_HOJE ? "INCLUÍDO — pare as importações antes" : "poupado (use --incluir-hoje para limpar)"}`);

if (!APLICAR) {
  console.log("\n[plano apenas] Nada foi apagado. Para aplicar: --apply (faça backup antes).");
  await prisma.$disconnect();
  process.exit(0);
}

// Lotes pequenos: um DELETE único de ~830 mil linhas segura locks durante
// minutos e colide com qualquer import a decorrer.
const LOTE = 3;
let feitos = 0;
for (let i = 0; i < aApagar.length; i += LOTE) {
  const ids = aApagar.slice(i, i + LOTE).map((r) => r.id);
  await prisma.scrapeRun.deleteMany({ where: { id: { in: ids } } });
  feitos += ids.length;
  process.stdout.write(`\rapagados ${feitos}/${aApagar.length} runs`);
}
console.log("\nfeito.");

const [depois] = await prisma.$queryRawUnsafe(
  `select (select count(*)::int from scrape_runs) runs,
          (select count(*)::int from product_snapshots) snaps,
          pg_size_pretty(pg_database_size(current_database())) tamanho`
);
console.log(`Agora: ${depois.runs} runs, ${depois.snaps.toLocaleString("pt-PT")} snapshots, ${depois.tamanho}`);
console.log(
  "\nO ficheiro do Postgres só encolhe com VACUUM FULL, que TRANCA a tabela.\n" +
  "Corra-o só com as importações paradas:\n" +
  '  docker exec tiktok-shop-postgres-local psql -U tiktok_dev -d tiktok_shop_dev -c "vacuum full analyze product_snapshots, seller_snapshots;"'
);

await prisma.$disconnect();
