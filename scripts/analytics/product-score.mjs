/**
 * Score de produto v1 — heurística 0–100 (só leitura; não persistido na base).
 */
import { PrismaClient } from "@prisma/client";
import { getLatestAndPreviousRun, printSeparator, requireDatabaseUrl } from "./_common.mjs";

const prisma = new PrismaClient();

function pontosVendas(sc) {
  if (sc == null) return 0;
  if (sc >= 1000) return 35;
  if (sc >= 300) return 25;
  if (sc >= 100) return 15;
  if (sc >= 10) return 8;
  return 0;
}

/** @param {number | null | undefined} avg @param {number | null | undefined} tot */
function pontosAvaliacao(avg, tot) {
  if (avg == null || tot == null) return 0;
  if (avg >= 4.8 && tot >= 10) return 25;
  if (avg >= 4.5 && tot >= 5) return 18;
  if (avg >= 4.0 && tot >= 5) return 10;
  return 0;
}

/** @param {number | null | undefined} price */
function pontosPreco(price) {
  return price != null && Number(price) > 0 ? 10 : 0;
}

/** @param {boolean} hasDiscount */
function pontosDesconto(hasDiscount) {
  return hasDiscount ? 5 : 0;
}

/** @param {number | null | undefined} sc @param {number | null | undefined} avg @param {number | null | undefined} tot @param {number | null | undefined} price */
function pontosOportunidade(sc, avg, tot, price) {
  if (price == null || sc == null || avg == null || tot == null) return 0;
  if (sc >= 10 && sc <= 300 && avg >= 4.5 && tot >= 5) return 15;
  return 0;
}

/**
 * Delta = vendas_actual − vendas_previous quando ambos existem no par de runs escolhido.
 * @returns {{ pts: number, delta: number | null }}
 */
function pontosCrescimento(delta, podeCalcularDelta) {
  if (!podeCalcularDelta || delta == null) return { pts: 0, delta: null };
  if (delta > 100) return { pts: 10, delta };
  if (delta > 30) return { pts: 6, delta };
  if (delta > 0) return { pts: 3, delta };
  return { pts: 0, delta };
}

function rotulo(score) {
  if (score >= 80) return "excelente";
  if (score >= 60) return "bom";
  if (score >= 40) return "observar";
  return "fraco";
}

/** @param {object} opts */
function motivosLista(opts) {
  const list = [];

  const { sc, vPts, rPts, oPts } = opts;
  if (typeof sc === "number") {
    if (vPts >= 15) list.push("vendas fortes");
    else if (vPts >= 8) list.push("tração de vendas");
  }

  if (rPts >= 18) list.push("boa avaliação");
  else if (rPts >= 10) list.push("avaliação ok");

  if (opts.pPts > 0) list.push("preço válido");
  if (opts.dPts > 0) list.push("desconto ativo");
  if (oPts === 15) list.push("oportunidade: baixa venda + boa avaliação");

  if (opts.semBaseGrowth) list.push("sem base de crescimento");
  else if (opts.gPts > 0 && opts.podeDelta) list.push("crescimento positivo");

  return list;
}

async function main() {
  requireDatabaseUrl();

  const { latest, previous, count } = await getLatestAndPreviousRun(prisma);

  if (!latest) {
    console.log("Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output).\n");
    process.exitCode = 0;
    return;
  }

  const prevPorRef = new Map();
  if (count >= 2 && previous) {
    const prevSnaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: previous.id, salesCount: { not: null } },
      select: { productRefId: true, salesCount: true }
    });
    for (const ps of prevSnaps) prevPorRef.set(ps.productRefId, ps.salesCount);
  }

  const snaps = await prisma.productSnapshot.findMany({
    where: { scrapeRunId: latest.id },
    include: {
      product: { include: { seller: true } }
    }
  });

  if (snaps.length === 0) {
    console.log("Último ScrapeRun sem ProductSnapshot.");
    process.exitCode = 0;
    return;
  }

  const linhas = [];

  for (const s of snaps) {
    const sc = s.salesCount;
    const avg = s.ratingAverage;
    const tot = s.ratingTotal;

    const vPts = pontosVendas(sc);
    const rPts = pontosAvaliacao(avg, tot);
    const pPts = pontosPreco(s.price);
    const dPts = pontosDesconto(s.hasDiscount);
    const oPts = pontosOportunidade(sc, avg, tot, s.price);

    const prevSale = prevPorRef.get(s.productRefId);
    const podeDelta =
      count >= 2 &&
      previous != null &&
      sc != null &&
      prevSale != null;

    const delta = podeDelta ? sc - prevSale : null;

    let semBaseGrowth = false;
    if (count < 2 || !previous) {
      semBaseGrowth = true;
    } else if (!podeDelta) {
      semBaseGrowth = true;
    } else if (delta == null || Number.isNaN(delta)) {
      semBaseGrowth = true;
    } else {
      semBaseGrowth = false;
    }

    const { pts: gPts } = pontosCrescimento(delta ?? null, Boolean(podeDelta));

    let totalPts = vPts + rPts + pPts + dPts + oPts + gPts;
    if (totalPts > 100) totalPts = 100;

    const motivos = motivosLista({
      sc,
      vPts,
      rPts,
      pPts,
      dPts,
      oPts,
      gPts,
      semBaseGrowth,
      podeDelta: Boolean(podeDelta)
    }).join("; ");

    const ratingStr =
      avg != null
        ? `${avg}${typeof tot === "number" ? ` (${tot} aval)` : ""}`
        : "";

    linhas.push({
      score: totalPts,
      classific: rotulo(totalPts),
      nome: (s.product.name ?? "—").slice(0, 40),
      loja: (s.product.seller?.name ?? "—").slice(0, 24),
      preco: s.price ?? "",
      vendas: sc ?? "",
      rating: ratingStr,
      deltaVendas: podeDelta && delta != null ? String(delta) : "—",
      motivos,
      link: s.product.productUrl ?? "",
      productId: s.product.productId
    });
  }

  linhas.sort((a, b) => b.score - a.score);
  const top = linhas.slice(0, 30);

  console.log("Score de produto v1 (0–100, só leitura; não gravado)\n");
  console.log(`Último ScrapeRun: ${latest.id} | collectedAt: ${latest.collectedAt.toISOString()}`);
  console.log(previous ? `Run anterior (crescimento): ${previous.id}` : "Um único run — crescimento = 0 (sem comparável).");

  console.log("");
  printSeparator();
  console.table(
    top.map((r, i) => ({
      idx: i + 1,
      score: r.score,
      classific: r.classific,
      productId: r.productId,
      nome: r.nome,
      loja: r.loja,
      preco: r.preco,
      vendas: r.vendas,
      rating: r.rating,
      deltaV: r.deltaVendas,
      motivos: r.motivos.slice(0, 90) + (r.motivos.length > 90 ? "…" : "")
    }))
  );

  console.log("");
  console.log("Links (top 30, completos — um por linha):");
  top.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. score=${String(r.score).padStart(3)} :: ${r.link}`);
  });

  printSeparator();
  console.log(`Listados: ${top.length} (máximo 30) de ${snaps.length} snapshots no último run.`);
  console.log("Faixas: excelente ≥80 · bom ≥60 · observar ≥40 · fraco <40 (`docs/ANALYTICS.md`).");
  console.log("");
}

try {
  await main();
} catch (e) {
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
