/**
 * `npm run pacote:symphony` — prepara produtos para o Symphony Creative Studio.
 *
 * ┌─ O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────
 * │ Não gera vídeo. O TikTok gera, no Symphony, e é por isso que o vídeo
 * │ passa nas regras deles — quem faz as regras faz a ferramenta.
 * │
 * │ Isto responde à pergunta que o Symphony NÃO responde: em QUAIS dos 20
 * │ mil produtos vale gastar um dos 80 créditos. Depois entrega as fotos e
 * │ o prompt prontos para arrastar.
 * └──────────────────────────────────────────────────────────────────────
 *
 * A ORDEM DE ESCOLHA, do mais forte ao mais fraco:
 *   1. direção do dono (`npm run direcao`) — fora de escopo nem entra
 *   2. curadoria (`npm run curadoria`) — `gastar_credito` decide
 *   3. ritmo recente (delta7d ÷ dias reais) — o que está a esquentar. Ritmo,
 *      não total: a janela varia entre 7 e 14 dias conforme a cadência da
 *      coleta, e ordenar pelo delta bruto premiaria quem foi medido sobre
 *      mais dias sem ser melhor produto.
 *   4. vendas totais — o que já provou que vende
 *
 * ESCRITA ATÓMICA: cada pacote é montado em `<pasta>_nova` e renomeado no
 * fim. Nunca há meio-pacote para alguém arrastar para o Symphony e descobrir
 * a meio que faltavam fotos — a mesma ideia da troca transacional da vitrine
 * do product-seeker, feita em disco.
 *
 * Uso:
 *   npm run pacote:symphony -- --top 10
 *   npm run pacote:symphony -- --top 5 --fotos 3
 */

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { LIMIAR_SUSPEITA, suspeitaDeTexto } from "./lib/imagem-de-texto.mjs";
import { verificarTexto, categoriaSensivel, blocoDeConformidade } from "./lib/politica-tiktok.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const num = (f, omissao) => {
  const i = argv.indexOf(f);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : omissao;
};

const TOP = num("--top", 10);
const MAX_FOTOS = num("--fotos", 4);

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const paraPasta = (s) =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sem-nome";

const soHttp = (v) => (Array.isArray(v) ? v : []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));

/** Escolhe os produtos, pela ordem documentada no cabeçalho. */
async function escolher(quantos) {
  const [direcoes, curadorias] = await Promise.all([
    prisma.categoriaDirecao.findMany(),
    prisma.productCuration.findMany()
  ]);
  const foraDeEscopo = new Set(direcoes.filter((d) => d.prioridade < 0).map((d) => d.chave));
  const interesse = new Set(direcoes.filter((d) => d.prioridade > 0).map((d) => d.chave));
  const porProduto = new Map(curadorias.map((c) => [c.productId, c]));

  const produtos = await prisma.product.findMany({
    where: { hiddenAt: null, enrichStatus: "ok", name: { not: null } },
    select: {
      productId: true, name: true, rotuloCurto: true, especie: true,
      categoryUrl: true, productUrl: true, delta7d: true, delta7dDias: true,
      snapshots: {
        orderBy: { capturedAt: "desc" }, take: 30,
        select: { capturedAt: true, salesCount: true, ratingAverage: true, ratingTotal: true, price: true, pdpImages: true }
      }
    }
  });

  const linhas = [];
  for (const p of produtos) {
    const cur = porProduto.get(p.productId);
    if (cur?.gastarCredito === false) continue;

    const chaveCat = (p.categoryUrl ?? "").split("/c/")[1]?.replace("/", "-")?.split("?")[0] ?? "";
    if (foraDeEscopo.has(chaveCat)) continue;

    // Galeria do snapshot mais recente que a TENHA — uma re-coleta grava
    // snapshot sem fotos, e sem este recuo o produto pareceria vazio.
    const comGaleria = p.snapshots.find((s) => soHttp(s.pdpImages).length >= 2);
    if (!comGaleria) continue;

    const atual = p.snapshots[0];
    linhas.push({
      productId: p.productId,
      nome: p.name,
      // Curado VENCE o derivado. Sempre.
      rotulo: cur?.rotulo || p.rotuloCurto || paraPasta(p.name),
      especie: p.especie ?? "produto",
      link: p.productUrl ?? "",
      preco: atual?.price ?? null,
      vendas: atual?.salesCount ?? null,
      nota: atual?.ratingAverage ?? null,
      avaliacoes: atual?.ratingTotal ?? null,
      delta7d: p.delta7d ?? null,
      delta7dDias: p.delta7dDias ?? null,
      /*
       * Ritmo, não total: a janela varia entre 7 e 14 dias conforme a
       * cadência da coleta. Ordenar pelo delta bruto premiaria quem foi
       * medido sobre um período maior — mais dias, mais vendas, sem ser
       * melhor produto.
       */
      ritmoDia: Number.isFinite(p.delta7d) && Number.isFinite(p.delta7dDias) && p.delta7dDias > 0
        ? p.delta7d / p.delta7dDias
        : null,
      fotos: soHttp(comGaleria.pdpImages),
      fotosDeOutroRun: comGaleria !== atual,
      fotosEm: comGaleria.capturedAt,
      medidoEm: atual?.capturedAt ?? null,
      prioridade: interesse.has(chaveCat) ? 1 : 0,
      curadoPara: cur?.gastarCredito === true
    });
  }

  linhas.sort((a, b) =>
    (b.prioridade - a.prioridade) ||
    (Number(b.curadoPara) - Number(a.curadoPara)) ||
    ((b.ritmoDia ?? -1) - (a.ritmoDia ?? -1)) ||
    ((b.vendas ?? 0) - (a.vendas ?? 0))
  );
  return linhas.slice(0, quantos);
}

/** Baixa, avalia e grava as fotos. Devolve o que entrou e o que ficou suspeito. */
async function tratarFotos(urls, destino, max) {
  const escolhidas = [];
  const suspeitas = [];

  for (const url of urls) {
    if (escolhidas.length >= max) break;
    let bruto;
    try {
      const res = await fetch(url, { headers: { Referer: "https://shop.tiktok.com/" } });
      if (!res.ok) continue;
      bruto = Buffer.from(await res.arrayBuffer());
    } catch { continue; }

    let analise = { suspeita: 0, porQue: "não analisada" };
    try {
      const { data, info } = await sharp(bruto).resize(120, 120, { fit: "inside" }).removeAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      analise = suspeitaDeTexto({ data, largura: info.width, altura: info.height, canais: info.channels });
    } catch { /* imagem ilegível: entra na mesma, o Symphony que recuse */ }

    const n = escolhidas.length + 1;
    const ficheiro = `${String(n).padStart(2, "0")}.jpg`;
    try {
      await sharp(bruto).jpeg({ quality: 92 }).toFile(path.join(destino, ficheiro));
    } catch { continue; }

    escolhidas.push({ ficheiro, url, suspeita: analise.suspeita });
    if (analise.suspeita >= LIMIAR_SUSPEITA) {
      suspeitas.push({ ficheiro, suspeita: analise.suspeita, porQue: analise.porQue });
    }
  }
  return { escolhidas, suspeitas };
}

function montarPrompt(p) {
  return [
    "Vídeo vertical 9:16 de produto.",
    "",
    `Produto: ${p.rotulo}.`,
    "",
    "A câmara aproxima-se devagar do produto, com luz natural suave e",
    "movimento contínuo, sem cortes bruscos.",
    "",
    "IMPORTANTE: manter a forma, a cor e o padrão do produto exactamente como",
    "nas imagens de referência. Não alterar o desenho, não inventar detalhe,",
    "não acrescentar texto no ecrã nem logótipos além dos que estão no produto.",
    ""
  ].join("\n");
}

function montarLegenda(p) {
  const partes = [`${p.rotulo}.`];
  if (Number.isFinite(p.vendas) && p.vendas >= 100) {
    const passo = p.vendas < 1000 ? 100 : p.vendas < 10_000 ? 1000 : 10_000;
    const n = Math.floor(p.vendas / passo) * passo;
    partes.push(`Mais de ${n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR")} mil` : n} pessoas já compraram.`);
  }
  if (Number.isFinite(p.nota) && Number.isFinite(p.avaliacoes) && p.avaliacoes >= 5) {
    partes.push(`Avaliação ${p.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} com ${p.avaliacoes.toLocaleString("pt-BR")} avaliações.`);
  }
  partes.push("O link está na loja do perfil, com o preço de hoje.");
  return partes.join(" ");
}

async function principal() {
  const dia = new Date().toISOString().slice(0, 10);
  const base = path.join(RAIZ, "exportado", "symphony", dia);

  console.log(`\n  A escolher os ${TOP} melhores…`);
  const lista = await escolher(TOP);
  if (lista.length === 0) {
    console.log("\n  Nenhum produto elegível: precisa de galeria (npm run pdp:enrich) e de não estar fora de escopo.\n");
    return 0;
  }

  let feitos = 0;
  const avisos = [];

  for (const p of lista) {
    const nomePasta = `${paraPasta(p.rotulo)}__${p.productId}`;
    const destinoFinal = path.join(base, nomePasta);
    const destinoTmp = `${destinoFinal}_nova`;

    rmSync(destinoTmp, { recursive: true, force: true });
    mkdirSync(destinoTmp, { recursive: true });

    const { escolhidas, suspeitas } = await tratarFotos(p.fotos, destinoTmp, MAX_FOTOS);
    if (escolhidas.length === 0) {
      rmSync(destinoTmp, { recursive: true, force: true });
      avisos.push(`${p.rotulo}: nenhuma foto pôde ser baixada — pasta não criada`);
      continue;
    }

    const legenda = montarLegenda(p);
    const faltando = [];
    if (!Number.isFinite(p.vendas)) faltando.push("vendas");
    if (!Number.isFinite(p.nota)) faltando.push("nota");
    if (escolhidas.length < MAX_FOTOS) faltando.push(`fotos (${escolhidas.length}/${MAX_FOTOS})`);

    writeFileSync(path.join(destinoTmp, "prompt.txt"), montarPrompt(p), "utf8");
    writeFileSync(
      path.join(destinoTmp, "legenda.txt"),
      legenda + "\n\n" + blocoDeConformidade({
        roteiro: legenda, legenda, nomeProduto: p.rotulo, usouFotosDeClientes: false
      }) + "\n",
      "utf8"
    );
    writeFileSync(
      path.join(destinoTmp, "ficha.json"),
      JSON.stringify({
        productId: p.productId,
        rotulo: p.rotulo,
        nomeCompleto: p.nome,
        especie: p.especie,
        link: p.link,
        preco: p.preco,
        vendas: p.vendas,
        nota: p.nota,
        avaliacoes: p.avaliacoes,
        delta7d: p.delta7d,
        delta7dDias: p.delta7dDias,
        vendasPorDiaRecente: p.ritmoDia == null ? null : Math.round(p.ritmoDia * 10) / 10,
        medidoEm: p.medidoEm,
        fotos: escolhidas,
        fotosDeOutroRun: p.fotosDeOutroRun,
        fotosCapturadasEm: p.fotosEm,
        // O que falta é dito, não escondido: uma ficha sem vendas continua
        // a existir, e quem a lê sabe que o número não está lá.
        faltando,
        suspeitasDeTexto: suspeitas,
        alegacoesARever: verificarTexto(legenda),
        categoriaSensivel: categoriaSensivel(p.rotulo, legenda)
      }, null, 2),
      "utf8"
    );

    // Só agora o pacote passa a existir com o nome final.
    rmSync(destinoFinal, { recursive: true, force: true });
    renameSync(destinoTmp, destinoFinal);
    feitos++;

    const marca = suspeitas.length > 0 ? ` ⚑ ${suspeitas.length} foto(s) a confirmar` : "";
    console.log(`  ${String(feitos).padStart(2)}. ${p.rotulo.padEnd(34).slice(0, 34)} ${escolhidas.length} foto(s)${marca}`);
    if (p.especie === "acessorio") avisos.push(`${p.rotulo}: é acessório — vídeo sozinho costuma não vender`);
  }

  console.log(`\n  ${feitos} pacote(s) em exportado/symphony/${dia}/\n`);
  for (const a of avisos) console.log(`  ⚠️  ${a}`);
  if (avisos.length) console.log("");
  console.log("  Cada pasta tem as fotos, prompt.txt, legenda.txt e ficha.json.");
  console.log("  Arraste as fotos para https://ads.tiktok.com/creative/creativestudio/");
  console.log("  e cole o prompt.txt. Confirme as fotos marcadas com ⚑ antes.\n");
  return 0;
}

const codigo = await principal().catch((e) => {
  console.error("\n  falhou:", e?.message ?? e, "\n");
  return 1;
});
await prisma.$disconnect();
process.exit(codigo);
