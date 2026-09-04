/**
 * `npm run direcao` — o volante da coleta: onde ir, onde não gastar.
 *
 * ┌─ POR QUE ISTO EXISTE ────────────────────────────────────────────────
 * │ A fila ordena por oportunidade medida, e isso é bom para descoberta.
 * │ Mas o dono tem prioridades que os dados não mostram: um nicho que ele
 * │ conhece, uma categoria que já sabe que não converte, uma promessa a
 * │ cumprir. Sem uma forma de dizer isso, a única alternativa é editar
 * │ código — e aí a razão da escolha morre no diff.
 * │
 * │ Com 80 gerações de vídeo no Symphony, isto deixou de ser conforto:
 * │ categoria fora de escopo não pode gastar coleta NEM crédito.
 * └──────────────────────────────────────────────────────────────────────
 *
 * A NOTA É OBRIGATÓRIA, e não é burocracia. Prioridade sem motivo, seis
 * meses depois, vira medo de mexer: ninguém lembra por que aquela categoria
 * está de fora, e ninguém se atreve a religá-la.
 *
 * ESTE É O ÚNICO ESCRITOR desta tabela. Se um processo automático começar a
 * escrever aqui, o volante virou piloto e a coluna perdeu o sentido.
 *
 * Uso:
 *   npm run direcao                                   o painel
 *   npm run direcao -- <chave> --prioridade 1  --nota "..."   interesse
 *   npm run direcao -- <chave> --prioridade -1 --nota "..."   fora de escopo
 *   npm run direcao -- <chave> --limpar                       volta ao padrão
 *
 * <chave> é o `slug-id` do CATALOG, ou só o id, ou parte do nome.
 */

import { PrismaClient } from "@prisma/client";
import { CATALOG } from "./scrape-all-categories.mjs";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);

const valor = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const tem = (flag) => argv.includes(flag);

const chaveDe = (cat) => `${cat.slug}-${cat.id}`;

/** Aceita `slug-id`, só o id, o slug, ou um pedaço do nome. */
function acharCategoria(termo) {
  const t = String(termo).trim().toLowerCase();
  const exatas = CATALOG.filter(
    (c) => chaveDe(c).toLowerCase() === t || c.id === t || c.slug.toLowerCase() === t
  );
  if (exatas.length === 1) return { ok: true, cat: exatas[0] };

  const parciais = CATALOG.filter(
    (c) => c.label.toLowerCase().includes(t) || chaveDe(c).toLowerCase().includes(t)
  );
  if (parciais.length === 1) return { ok: true, cat: parciais[0] };
  if (parciais.length === 0) return { ok: false, erro: `nenhuma categoria casa com "${termo}"` };
  return {
    ok: false,
    erro: `"${termo}" casa com ${parciais.length} categorias — seja específico`,
    opcoes: parciais.slice(0, 8)
  };
}

async function painel() {
  const dirigidas = await prisma.categoriaDirecao.findMany({ orderBy: [{ prioridade: "desc" }, { chave: "asc" }] });
  const porChave = new Map(dirigidas.map((d) => [d.chave, d]));

  const interesse = dirigidas.filter((d) => d.prioridade > 0);
  const fora = dirigidas.filter((d) => d.prioridade < 0);

  console.log(`\n  Direção — ${CATALOG.length} categorias no catálogo\n`);
  console.log(`  ${String(interesse.length).padStart(3)}  interesse (furam a fila)`);
  console.log(`  ${String(fora.length).padStart(3)}  fora de escopo (não gastam coleta nem crédito)`);
  console.log(`  ${String(CATALOG.length - dirigidas.length).padStart(3)}  sem direção (descoberta padrão)\n`);

  if (dirigidas.length === 0) {
    console.log("  Nenhuma categoria dirigida ainda.");
    console.log('  Exemplo:  npm run direcao -- vestidos --prioridade 1 --nota "converte bem"\n');
    return;
  }

  for (const grupo of [
    { titulo: "INTERESSE", linhas: interesse },
    { titulo: "FORA DE ESCOPO", linhas: fora }
  ]) {
    if (grupo.linhas.length === 0) continue;
    console.log(`  ${grupo.titulo}`);
    for (const d of grupo.linhas) {
      const cat = CATALOG.find((c) => chaveDe(c) === d.chave);
      const nome = cat ? cat.label : `${d.chave} (fora do catálogo!)`;
      console.log(`    ${nome}`);
      console.log(`      ${d.nota}`);
    }
    console.log("");
  }

  // Direção que aponta para categoria que já não existe é lixo silencioso.
  const orfas = dirigidas.filter((d) => !CATALOG.some((c) => chaveDe(c) === d.chave));
  if (orfas.length > 0) {
    console.log(`  ⚠️  ${orfas.length} direção(ões) apontam para categorias fora do catálogo actual.`);
    console.log(`      Limpe com:  npm run direcao -- <chave> --limpar\n`);
  }
}

async function principal() {
  if (argv.length === 0 || tem("--painel")) {
    await painel();
    return 0;
  }

  const termo = argv.find((a) => !a.startsWith("--"));
  if (!termo) {
    console.error("  Falta a categoria. Veja o painel com:  npm run direcao");
    return 1;
  }

  const achado = acharCategoria(termo);
  if (!achado.ok) {
    console.error(`\n  ${achado.erro}`);
    for (const c of achado.opcoes ?? []) console.error(`    ${chaveDe(c).padEnd(42)} ${c.label}`);
    console.error("");
    return 1;
  }
  const chave = chaveDe(achado.cat);

  if (tem("--limpar")) {
    await prisma.categoriaDirecao.deleteMany({ where: { chave } });
    console.log(`\n  "${achado.cat.label}" volta à descoberta padrão.\n`);
    return 0;
  }

  const bruto = valor("--prioridade");
  const prioridade = Number(bruto);
  if (bruto === null || ![1, -1].includes(prioridade)) {
    console.error("\n  --prioridade tem de ser 1 (interesse) ou -1 (fora de escopo).\n");
    return 1;
  }

  const nota = valor("--nota");
  if (!nota || nota.trim().length < 3) {
    console.error("\n  --nota é obrigatória.");
    console.error("  Daqui a seis meses ninguém lembra o motivo, e prioridade sem");
    console.error("  motivo vira medo de mexer: ninguém sabe se pode religar.\n");
    return 1;
  }

  await prisma.categoriaDirecao.upsert({
    where: { chave },
    create: { chave, prioridade, nota: nota.trim() },
    update: { prioridade, nota: nota.trim() }
  });

  const rotulo = prioridade > 0 ? "INTERESSE — fura a fila" : "FORA DE ESCOPO — não gasta coleta nem crédito";
  console.log(`\n  "${achado.cat.label}" → ${rotulo}`);
  console.log(`  ${nota.trim()}\n`);
  return 0;
}

const codigo = await principal().catch((e) => {
  console.error("\n  falhou:", e?.message ?? e, "\n");
  return 1;
});
await prisma.$disconnect();
process.exit(codigo);
