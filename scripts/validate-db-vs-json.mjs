/**
 * Valida consistência entre output/dados_produtos.json (+ dados_lojas opcional)
 * e os dados já importados no Postgres (ProductSnapshot do ScrapeRun correspondente).
 * Usa o mesmo inputHash que scripts/import-output-to-db.mjs.
 */
import { createHash } from "node:crypto";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DADOS_PRODUTOS = path.join(root, "output", "dados_produtos.json");
const DADOS_LOJAS = path.join(root, "output", "dados_lojas.json");

const EPS_PRICE = 1e-4;

function computeInputHash(produtosText, lojasTextOrAbsent) {
  const boundary = "\n---IMPORT_INPUT_HASH_V1---\n";
  return createHash("sha256").update(Buffer.from(produtosText + boundary + lojasTextOrAbsent, "utf8")).digest("hex");
}

async function fileExists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function numEq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < EPS_PRICE;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL não definida. Ex.: node --env-file=.env scripts/validate-db-vs-json.mjs"
    );
  }

  if (!(await fileExists(DADOS_PRODUTOS))) {
    throw new Error(`Ficheiro em falta: ${path.relative(root, DADOS_PRODUTOS)}`);
  }

  const produtosText = await readFile(DADOS_PRODUTOS, "utf8");
  const lojasTextOrAbsent = (await fileExists(DADOS_LOJAS))
    ? await readFile(DADOS_LOJAS, "utf8")
    : "__NO_DADOS_LOJAS_FILE__";
  const inputHash = computeInputHash(produtosText, lojasTextOrAbsent);

  const dadosProdutos = JSON.parse(produtosText);
  const itens = Array.isArray(dadosProdutos.itens) ? dadosProdutos.itens : [];

  const prisma = new PrismaClient();

  let run = await prisma.scrapeRun.findFirst({
    where: { inputHash },
    select: { id: true, collectedAt: true, totalProducts: true, inputHash: true, createdAt: true }
  });

  let matchMode = "inputHash";
  if (!run) {
    run = await prisma.scrapeRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, collectedAt: true, totalProducts: true, inputHash: true, createdAt: true }
    });
    matchMode = "ultimo_run";
  }

  if (!run) {
    console.log("Nenhum ScrapeRun na base. Importa primeiro (npm run db:import:output).");
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const snapshots = await prisma.productSnapshot.findMany({
    where: { scrapeRunId: run.id },
    include: {
      product: {
        include: { seller: true }
      }
    }
  });

  const byPid = new Map();
  for (const s of snapshots) {
    const pid = s.product.productId;
    if (byPid.has(pid)) {
      byPid.get(pid).push(s);
    } else {
      byPid.set(pid, [s]);
    }
  }

  const issues = [];
  const checked = [];
  let jsonWithId = 0;

  for (const item of itens) {
    const productId = item.product_id != null ? String(item.product_id) : null;
    if (!productId) continue;
    jsonWithId++;

    const list = byPid.get(productId);
    if (!list || list.length === 0) {
      issues.push({ productId, problem: "snapshot em falta para este product_id no ScrapeRun escolhido" });
      continue;
    }
    if (list.length > 1) {
      issues.push({ productId, problem: `duplicado: ${list.length} snapshots no mesmo run (inesperado)` });
    }
    const s = list[0];

    const row = [];
    if (!numEq(s.price, item.preco)) row.push(`price DB=${s.price} JSON=${item.preco}`);
    if (!numEq(s.originalPrice, item.preco_original))
      row.push(`originalPrice DB=${s.originalPrice} JSON=${item.preco_original}`);
    if (Boolean(s.hasDiscount) !== Boolean(item.tem_desconto))
      row.push(`hasDiscount DB=${s.hasDiscount} JSON=${item.tem_desconto}`);
    if (!numEq(s.estimatedShowcasePrice, item.preco_estimado_vitrine))
      row.push(`estimatedShowcasePrice DB=${s.estimatedShowcasePrice} JSON=${item.preco_estimado_vitrine}`);
    if (!numEq(s.estimatedPriceGap, item.preco_gap_estimado))
      row.push(`estimatedPriceGap`);
    if (!numEq(s.estimatedPriceGapPercent, item.preco_gap_estimado_percent))
      row.push(`estimatedPriceGapPercent`);
    const vendasInt = item.vendas != null ? Math.trunc(Number(item.vendas)) : null;
    if (s.salesCount !== vendasInt && !(s.salesCount == null && vendasInt == null))
      row.push(`salesCount DB=${s.salesCount} JSON(trunc)=${vendasInt}`);
    const st = s.salesText ?? null;
    const jt = item.vendas_texto ?? null;
    if (st !== jt) row.push(`salesText DB=${JSON.stringify(st)} JSON=${JSON.stringify(jt)}`);
    if (!numEq(s.ratingAverage, item.avaliacao_media)) row.push(`ratingAverage`);
    const rt = item.avaliacoes_total != null ? Math.trunc(Number(item.avaliacoes_total)) : null;
    if (s.ratingTotal !== rt && !(s.ratingTotal == null && rt == null)) row.push(`ratingTotal DB=${s.ratingTotal} JSON=${rt}`);

    const sellerDb = s.product.seller?.sellerId ?? null;
    const sellerJson = item.seller_id != null ? String(item.seller_id) : null;
    if (sellerDb !== sellerJson) row.push(`seller_id DB=${sellerDb} JSON=${sellerJson}`);

    checked.push(productId);
    if (row.length) {
      issues.push({ productId, problem: row.join("; ") });
    }
  }

  if (matchMode === "inputHash") {
    for (const pid of byPid.keys()) {
      if (!itens.some((i) => String(i.product_id) === pid)) {
        issues.push({
          productId: pid,
          problem: "snapshot no run sem item correspondente no JSON"
        });
      }
    }
  }

  console.log("=== Validação JSON ↔ Postgres ===\n");
  console.log(`Ficheiro: ${path.relative(root, DADOS_PRODUTOS)}`);
  console.log(`Hash input (SHA-256): ${inputHash}`);
  console.log(`Modo run: ${matchMode === "inputHash" ? `ScrapeRun por inputHash (${run.id})` : `AVISO: sem run com este hash — usando último ScrapeRun (${run.id})`}`);
  console.log(`ScrapeRun: collectedAt=${run.collectedAt?.toISOString?.() ?? run.collectedAt}`);
  console.log(`Itens JSON com product_id: ${jsonWithId} | Snapshots neste run: ${snapshots.length}\n`);

  if (matchMode !== "inputHash") {
    console.log(
      "⚠ Este JSON não corresponde a nenhum import regido por inputHash; comparação pode não ser a coleta que gerou o ficheiro actual.\n"
    );
  }

  if (issues.length === 0 && jsonWithId === snapshots.length) {
    console.log("OK: todos os campos confrontados batem certo para cada product_id.");
    console.log(`(Conferidos por item: preço, original, desconto, estimados, vendas, texto vendas, ratings, seller_id.)`);
  } else {
    if (jsonWithId !== snapshots.length) {
      console.log(`AVISO: contagens diferentes — JSON com product_id=${jsonWithId}, snapshots no run=${snapshots.length}`);
    }
    if (issues.length) {
      console.log("\nProblemas:\n");
      for (const x of issues.slice(0, 50)) {
        console.log(`  [${x.productId}] ${x.problem}`);
      }
      if (issues.length > 50) console.log(`  ... mais ${issues.length - 50} entradas.`);
      process.exitCode = 1;
    } else {
      console.log("\nContagens divergem mas campos chequeados nos itens pareados estão consistentes.");
    }
  }

  await prisma.$disconnect();
}

await main();
