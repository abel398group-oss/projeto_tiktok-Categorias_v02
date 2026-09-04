/**
 * `npm run curadoria` — o mutirão da curadoria de produtos.
 *
 * ┌─ ESTE SCRIPT NÃO CURA ───────────────────────────────────────────────
 * │ Curadoria é julgamento: decidir que "Meu Deus! Kit de 14 bits" na
 * │ verdade vende BITS DE PARAFUSADEIRA, ou que aquele produto não merece
 * │ um dos 80 créditos, exige ler o título com contexto.
 * │
 * │ O script prepara a mesa e recolhe a louça: exporta lotes do tamanho
 * │ que um curador (pessoa ou agente) aguenta, e carrega as respostas.
 * └──────────────────────────────────────────────────────────────────────
 *
 * O CICLO:
 *   npm run curadoria -- --exportar    o que falta → curadoria/lote-NN.csv
 *   (cada lote vai para um curador; as respostas voltam como
 *    curadoria/resposta-NN.csv, com as mesmas colunas)
 *   npm run curadoria -- --carregar    junta as respostas e grava na base
 *   npm run curadoria -- --status      quanto falta
 *
 * Opções:  --por-lote 50    produtos por lote (padrão 50)
 *          --limite 500     teto de produtos exportados
 *
 * Instruções do curador: docs/PROMPT-CURADORIA-DE-PRODUTOS.md
 *
 * O curado VENCE o derivado e nunca é sobrescrito por processo automático —
 * julgamento humano que um re-import apaga não é curadoria, é rascunho.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = path.join(RAIZ, "curadoria");
const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const tem = (f) => argv.includes(f);
const num = (f, omissao) => {
  const i = argv.indexOf(f);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : omissao;
};

const COLUNAS = ["product_id", "rotulo_sugerido", "rotulo_final", "gastar_credito", "nota"];

/** CSV com vírgula como separador: o campo não pode conter vírgula. */
const limpar = (v) => String(v ?? "").replace(/[,\r\n]+/g, " ").trim();

function partirLinha(linha) {
  return linha.split(",").map((c) => c.trim());
}

/**
 * Os candidatos a curar: com giro medido primeiro, porque é onde o crédito
 * vai ser gasto. Produto sem vendas não merece o tempo de um curador.
 */
async function candidatos(limite) {
  /*
   * Os já curados saem por conjunto, não por join: `ProductCuration` não tem
   * chave estrangeira para `Product` de propósito — um produto pode ser
   * curado antes de a coleta seguinte o trazer de volta, e uma FK apagaria
   * essa curadoria em cascata.
   */
  const jaCurados = new Set(
    (await prisma.productCuration.findMany({ select: { productId: true } })).map((c) => c.productId)
  );

  const produtos = await prisma.product.findMany({
    where: { hiddenAt: null, name: { not: null } },
    select: {
      productId: true,
      name: true,
      rotuloCurto: true,
      especie: true,
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { salesCount: true, ratingAverage: true }
      }
    },
    take: limite * 4
  });

  return produtos
    .filter((p) => !jaCurados.has(p.productId))
    .map((p) => ({
      productId: p.productId,
      nome: p.name,
      rotulo: p.rotuloCurto ?? "",
      especie: p.especie ?? "",
      vendas: p.snapshots[0]?.salesCount ?? 0
    }))
    .sort((a, b) => b.vendas - a.vendas)
    .slice(0, limite);
}

async function exportar() {
  const porLote = num("--por-lote", 50);
  const limite = num("--limite", 500);
  mkdirSync(PASTA, { recursive: true });

  const lista = await candidatos(limite);
  if (lista.length === 0) {
    console.log("\n  Nada por curar. Todos os produtos com nome já têm linha de curadoria.\n");
    return 0;
  }

  let n = 0;
  for (let i = 0; i < lista.length; i += porLote) {
    n++;
    const fatia = lista.slice(i, i + porLote);
    const linhas = [COLUNAS.join(",")];
    for (const p of fatia) {
      // `rotulo_final` e `gastar_credito` vão vazios: é o que o curador preenche.
      linhas.push([limpar(p.productId), limpar(p.rotulo), "", "", limpar(`${p.especie} · ${p.vendas} vendas · ${p.nome}`)].join(","));
    }
    const ficheiro = path.join(PASTA, `lote-${String(n).padStart(2, "0")}.csv`);
    writeFileSync(ficheiro, linhas.join("\n") + "\n", "utf8");
  }

  console.log(`\n  ${lista.length} produto(s) em ${n} lote(s) de ${porLote}, em curadoria/`);
  console.log("  Ordenados por vendas: o crédito vai ser gasto nos de cima.");
  console.log("\n  Cada lote vai para um curador. As respostas voltam como");
  console.log("  curadoria/resposta-NN.csv, com as mesmas colunas.");
  console.log("\n  Instruções: docs/PROMPT-CURADORIA-DE-PRODUTOS.md\n");
  return 0;
}

async function carregar() {
  if (!existsSync(PASTA)) {
    console.log("\n  Não há pasta curadoria/. Exporte primeiro.\n");
    return 1;
  }
  const respostas = readdirSync(PASTA).filter((f) => /^resposta-\d+\.csv$/i.test(f));
  if (respostas.length === 0) {
    console.log("\n  Nenhum ficheiro resposta-NN.csv em curadoria/.\n");
    return 1;
  }

  let gravados = 0;
  const recusados = [];

  for (const ficheiro of respostas) {
    const caminho = path.join(PASTA, ficheiro);
    const linhas = readFileSync(caminho, "utf8").split(/\r?\n/).filter((l) => l.trim());
    const cabecalho = partirLinha(linhas[0]).map((c) => c.toLowerCase());
    const col = (nome) => cabecalho.indexOf(nome);

    if (col("product_id") < 0) {
      recusados.push(`${ficheiro}: falta a coluna product_id`);
      continue;
    }

    for (const linha of linhas.slice(1)) {
      const c = partirLinha(linha);
      const productId = c[col("product_id")];
      if (!productId || !/^\d+$/.test(productId)) continue;

      const rotulo = col("rotulo_final") >= 0 ? c[col("rotulo_final")] : "";
      const bruto = (col("gastar_credito") >= 0 ? c[col("gastar_credito")] : "").toLowerCase();
      const nota = col("nota") >= 0 ? c[col("nota")] : "";

      /*
       * Vazio significa "sem opinião", não "não". Tratar vazio como `false`
       * tiraria do pacote todo produto que o curador simplesmente não chegou
       * a olhar — e o curador não teria como saber que o silêncio custou isso.
       */
      const gastarCredito =
        ["sim", "s", "yes", "true", "1"].includes(bruto) ? true :
        ["nao", "não", "n", "no", "false", "0"].includes(bruto) ? false :
        null;

      if (!rotulo && gastarCredito === null && !nota) continue; // linha em branco

      await prisma.productCuration.upsert({
        where: { productId },
        create: { productId, rotulo: rotulo || null, gastarCredito, nota: nota || null },
        update: { rotulo: rotulo || null, gastarCredito, nota: nota || null }
      });
      gravados++;
    }

    // Renomear evita carregar duas vezes sem dar por isso.
    renameSync(caminho, path.join(PASTA, `carregado-${ficheiro}`));
  }

  console.log(`\n  ${gravados} curadoria(s) gravada(s) de ${respostas.length} ficheiro(s).`);
  console.log("  Ficheiros renomeados para carregado-*.csv (não voltam a ser lidos).");
  for (const r of recusados) console.log(`  ⚠️  ${r}`);
  console.log("");
  return 0;
}

async function status() {
  const [total, curados, comRotulo, sim, nao] = await Promise.all([
    prisma.product.count({ where: { hiddenAt: null, name: { not: null } } }),
    prisma.productCuration.count(),
    prisma.productCuration.count({ where: { rotulo: { not: null } } }),
    prisma.productCuration.count({ where: { gastarCredito: true } }),
    prisma.productCuration.count({ where: { gastarCredito: false } })
  ]);

  console.log(`\n  Curadoria — ${total.toLocaleString("pt-BR")} produto(s) elegíveis\n`);
  console.log(`  ${String(curados).padStart(6)}  com linha de curadoria`);
  console.log(`  ${String(comRotulo).padStart(6)}  com rótulo corrigido à mão`);
  console.log(`  ${String(sim).padStart(6)}  marcados para gastar crédito`);
  console.log(`  ${String(nao).padStart(6)}  marcados para NÃO gastar`);
  console.log(`  ${String(total - curados).padStart(6)}  por curar\n`);

  const pendentes = existsSync(PASTA)
    ? readdirSync(PASTA).filter((f) => /^resposta-\d+\.csv$/i.test(f)).length
    : 0;
  if (pendentes > 0) console.log(`  ${pendentes} resposta(s) por carregar. Corra --carregar.\n`);
  return 0;
}

async function principal() {
  if (tem("--exportar")) return exportar();
  if (tem("--carregar")) return carregar();
  return status();
}

const codigo = await principal().catch((e) => {
  console.error("\n  falhou:", e?.message ?? e, "\n");
  return 1;
});
await prisma.$disconnect();
process.exit(codigo);
