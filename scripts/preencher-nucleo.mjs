/**
 * `npm run nucleo:preencher` — deriva núcleo, espécie e rótulo dos produtos
 * que já estão na base.
 *
 * O import passou a derivar isto sozinho, mas só para o que entra a partir de
 * agora. Sem este comando, os 20 mil produtos já colhidos ficariam sem rótulo
 * — e o pacote para o Symphony só poderia usar produto novo, que é o oposto
 * do que interessa (o que tem histórico é o que tem giro medido).
 *
 * Idempotente: correr duas vezes dá o mesmo resultado. Por omissão só toca no
 * que está por preencher; `--tudo` recalcula, para quando as listas do
 * `nucleo.mjs` mudarem.
 *
 * Uso:
 *   npm run nucleo:preencher              só o que falta
 *   npm run nucleo:preencher -- --tudo    recalcula tudo
 *   npm run nucleo:preencher -- --amostra ensaio, não escreve
 */

import { PrismaClient } from "@prisma/client";
import { especieDoTitulo, nucleoDoTitulo, rotuloCurto } from "../src/scrape/nucleo.mjs";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const TUDO = argv.includes("--tudo");
const AMOSTRA = argv.includes("--amostra");
const LOTE = 500;

async function principal() {
  const onde = TUDO ? { name: { not: null } } : { name: { not: null }, nucleo: null };
  const total = await prisma.product.count({ where: onde });

  console.log(`\n  ${total.toLocaleString("pt-BR")} produto(s) a processar${TUDO ? " (recálculo completo)" : ""}.`);
  if (AMOSTRA) console.log("  [amostra] nada será gravado.\n");

  let feitos = 0;
  let semNucleo = 0;
  const especies = { produto: 0, acessorio: 0, recompra: 0 };
  const exemplos = [];

  for (let salto = 0; salto < total; salto += LOTE) {
    const lote = await prisma.product.findMany({
      where: onde,
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      skip: AMOSTRA ? salto : 0, // sem amostra o filtro `nucleo: null` já avança sozinho
      take: LOTE
    });
    if (lote.length === 0) break;

    for (const p of lote) {
      const nucleo = nucleoDoTitulo(p.name);
      if (!nucleo) semNucleo++;
      const especie = nucleo ? especieDoTitulo(p.name) : null;
      if (especie) especies[especie] = (especies[especie] ?? 0) + 1;

      if (exemplos.length < 6 && nucleo) {
        exemplos.push({ rotulo: rotuloCurto(p.name), especie, titulo: String(p.name).slice(0, 46) });
      }

      if (!AMOSTRA) {
        await prisma.product.update({
          where: { id: p.id },
          data: { nucleo, especie, rotuloCurto: rotuloCurto(p.name) }
        });
      }
      feitos++;
    }

    if (feitos % 2000 < LOTE) {
      process.stdout.write(`\r  ${feitos.toLocaleString("pt-BR")} / ${total.toLocaleString("pt-BR")}…`);
    }
    if (AMOSTRA && salto >= LOTE * 2) break;
  }

  console.log(`\r  ${feitos.toLocaleString("pt-BR")} processado(s).            \n`);
  console.log(`  produto    ${String(especies.produto ?? 0).padStart(6)}`);
  console.log(`  acessorio  ${String(especies.acessorio ?? 0).padStart(6)}   (não viram vídeo sozinhos)`);
  console.log(`  recompra   ${String(especies.recompra ?? 0).padStart(6)}   (comissão recorrente)`);
  if (semNucleo > 0) {
    console.log(`\n  ⚠️  ${semNucleo} título(s) sem núcleo — vazios ou só números. Ficam para a curadoria.`);
  }
  console.log("\n  amostra:");
  for (const e of exemplos) {
    console.log(`    ${String(e.rotulo).padEnd(34)} [${e.especie}]  <- ${e.titulo}`);
  }
  console.log("");
  return 0;
}

const codigo = await principal().catch((e) => {
  console.error("\n  falhou:", e?.message ?? e, "\n");
  return 1;
});
await prisma.$disconnect();
process.exit(codigo);
