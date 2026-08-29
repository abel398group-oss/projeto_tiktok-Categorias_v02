/**
 * Inventário da base: linhas × disco × quem escreve × quem lê.
 *
 * Portado do `inventario.js` do product-seeker, adaptado a Prisma. Responde a
 * uma pergunta que hoje só tem palpite: que tabelas custam gravação em toda
 * coleta e não devolvem decisão nenhuma?
 *
 * O caso concreto que motivou isto: `raw_payloads` recebe o JSON consolidado
 * inteiro (~36 MB) a cada import, e um grep por `prisma.rawPayload.find` não
 * devolve NADA — ninguém lê. Ou existe caminho de reprocessamento a partir
 * dela, ou ela é custo puro. Este comando põe o número ao lado da suspeita.
 *
 * NÃO APAGA NADA. Só lê catálogo do Postgres e faz grep no código.
 *
 * Uso: npm run db:inventario
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDatabaseUrl } from "./analytics/_common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/**
 * Para que serve cada tabela, em português. Tabela sem papel declarado aparece
 * como tal — a lista existir é o que transforma "tem 6 tabelas" em "sei o que
 * cada uma faz aqui".
 */
const PAPEL = {
  scrape_runs: "uma linha por coleta. Âncora de todo relatório: 'último run' é daqui.",
  products: "identidade do produto (productId do TikTok). Acumula entre coletas.",
  product_snapshots: "preço/vendas/nota do produto NAQUELA coleta. É a série temporal.",
  sellers: "identidade da loja.",
  seller_snapshots:
    "estado da loja naquela coleta. SEM LEITOR HOJE, e mantida de propósito (23/08/2026): " +
    "é série histórica — barata de guardar, impossível de refazer depois. Consumidor previsto no ROADMAP.",
  raw_payloads:
    "envelope bruto do import, para reprocessar sem recoletar. Podada automaticamente: " +
    "só os N mais recentes ficam (RAW_PAYLOADS_MANTER, padrão 5). Decidido em 23/08/2026, " +
    "quando tinha 60 linhas e 235 MB — 27% da base — sem ninguém ler."
};

/** modelo Prisma → tabela no Postgres */
const MODELOS = {
  scrapeRun: "scrape_runs",
  product: "products",
  productSnapshot: "product_snapshots",
  seller: "sellers",
  sellerSnapshot: "seller_snapshots",
  rawPayload: "raw_payloads"
};

const ESCRITA = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
const LEITURA = ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"];

/** Ficheiros .mjs/.js/.jsx do projeto, sem node_modules nem output. */
async function ficheirosDoProjeto() {
  const out = [];
  const IGNORAR = new Set(["node_modules", ".git", "output", "dist", "exportado", ".puppeteer-profile"]);
  async function andar(dir) {
    let entradas;
    try { entradas = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (IGNORAR.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await andar(p);
      else if (/\.(mjs|js|jsx)$/.test(e.name)) out.push(p);
    }
  }
  await andar(ROOT);
  return out;
}

/**
 * Grep de `prisma.<modelo>.<metodo>` no código.
 *
 * A leitura é estática e grosseira DE PROPÓSITO: erra para o lado de dizer
 * "usada". Um falso "morta" mandaria apagar coisa viva; um falso "viva" só
 * deixa lixo mais um dia.
 */
function usosNoCodigo(fontes, modelo) {
  const reEscrita = new RegExp(`\\.${modelo}\\s*\\.\\s*(${ESCRITA.join("|")})\\b`);
  const reLeitura = new RegExp(`\\.${modelo}\\s*\\.\\s*(${LEITURA.join("|")})\\b`);
  const escrevem = [];
  const leem = [];
  for (const [ficheiro, src] of fontes) {
    // O próprio inventário cita todas as tabelas — se ele se contar como
    // leitor, acusa presença do defunto que veio investigar.
    if (ficheiro.endsWith("db-inventario.mjs")) continue;
    if (reEscrita.test(src)) escrevem.push(path.relative(ROOT, ficheiro));
    if (reLeitura.test(src)) leem.push(path.relative(ROOT, ficheiro));
  }
  return { escrevem, leem };
}

const fmt = (n) => Number(n).toLocaleString("pt-BR");

function mb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "?";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  requireDatabaseUrl();
  const prisma = new PrismaClient();

  const fontes = [];
  for (const f of await ficheirosDoProjeto()) {
    try { fontes.push([f, await fs.readFile(f, "utf8")]); } catch { /* ignora ilegível */ }
  }

  // n_live_tup é ESTIMATIVA e o Postgres zera-a ao reiniciar; o tamanho em
  // disco não mente. Os dois lado a lado evitam ler "0 linhas" como "vazia".
  const catalogo = await prisma.$queryRaw`
    SELECT c.relname::text            AS tabela,
           s.n_live_tup::bigint       AS estimadas,
           pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC
  `;

  console.log("\nINVENTÁRIO DA BASE — linhas × disco × quem escreve × quem lê");
  console.log("Só leitura. Nada é apagado.\n");

  const suspeitas = [];
  const semLeitor = [];
  const estatisticaVelha = [];

  for (const linha of catalogo) {
    const tabela = linha.tabela;
    const modelo = Object.keys(MODELOS).find((m) => MODELOS[m] === tabela);
    const papel = PAPEL[tabela] ?? "(sem papel declarado)";

    // Contagem real para as tabelas que conhecemos: a estimativa serve para
    // detectar discrepância, não para relatar.
    let reais = null;
    if (modelo) {
      try { reais = await prisma[modelo].count(); } catch { /* segue com estimativa */ }
    }

    console.log(`── ${tabela}`);
    console.log(`   ${reais != null ? `${fmt(reais)} linhas` : `~${fmt(linha.estimadas)} linhas (estimativa)`} · ${mb(linha.bytes)} em disco`);
    console.log(`   ${papel}`);

    if (modelo) {
      const { escrevem, leem } = usosNoCodigo(fontes, modelo);
      console.log(`   escreve: ${escrevem.length ? escrevem.join(", ") : "NINGUÉM"}`);
      console.log(`   lê:      ${leem.length ? leem.join(", ") : "NINGUÉM"}`);
      if (escrevem.length > 0 && leem.length === 0) {
        semLeitor.push({ tabela, bytes: linha.bytes, escrevem });
      }
    } else {
      console.log(`   (tabela fora do schema Prisma conhecido — ex.: _prisma_migrations)`);
    }

    // Só é suspeita quando NÃO conseguimos contar de verdade: aí a estimativa
    // zerada é tudo o que há, e um zero ao lado de disco ocupado já quase fez
    // alguém restaurar backup por cima de base saudável (incidente registado no
    // product-seeker). Quando o count real correu, a estimativa velha é só
    // ANALYZE em atraso — ruído, não perigo.
    if (reais == null && Number(linha.estimadas) === 0 && Number(linha.bytes) > 200_000) {
      suspeitas.push(tabela);
    }
    if (reais != null && reais > 0 && Number(linha.estimadas) === 0) {
      estatisticaVelha.push(tabela);
    }
    console.log("");
  }

  if (semLeitor.length > 0) {
    console.log("ALGUÉM ESCREVE, NINGUÉM LÊ");
    for (const s of semLeitor) {
      console.log(`  • ${s.tabela} (${mb(s.bytes)}) — escrita por ${s.escrevem.join(", ")}`);
    }
    console.log("  Custa gravação em toda coleta e não devolve decisão nenhuma.");
    console.log("  Ou alguém passa a ler, ou para de escrever.\n");
  }

  if (suspeitas.length > 0) {
    console.log("ESTATÍSTICA ZERADA, COM DISCO OCUPADO — e sem contagem real");
    console.log(`  ${suspeitas.join(", ")}`);
    console.log("  n_live_tup é estimativa e o Postgres zera-a ao reiniciar.");
    console.log("  NÃO conclua que a tabela está vazia — rode ANALYZE e confira.\n");
  }

  if (estatisticaVelha.length > 0) {
    console.log(
      `Nota: a estimativa do Postgres está desactualizada em ${estatisticaVelha.length} tabela(s) ` +
      `— as linhas acima foram contadas de verdade. Um ANALYZE arruma.\n`
    );
  }

  await prisma.$disconnect();
}

try {
  await main();
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
}
