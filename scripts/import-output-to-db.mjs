/**
 * Importa `output/dados_produtos.json` (+ opcional `dados_lojas.json`) para Postgres (Prisma).
 * Identidade: upsert (Seller, Product). Histórico: novos registos (snapshots + RawPayload).
 * Não altera nem recalcula campos; apenas mapeia valores do JSON.
 */
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { importOutputFromStrings } from "./lib/import-output-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const DADOS_PRODUTOS = path.join(root, "output", "dados_produtos.json");
const DADOS_LOJAS = path.join(root, "output", "dados_lojas.json");

let prisma;

function requireEnv() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env e configure a ligação ao Postgres."
    );
  }
}

async function fileExists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function importMain() {
  requireEnv();
  if (!(await fileExists(DADOS_PRODUTOS))) {
    throw new Error(
      `Ficheiro em falta: ${path.relative(root, DADOS_PRODUTOS)}. Gere a coleta antes (ex. npm run coleta).`
    );
  }

  const produtosText = await readFile(DADOS_PRODUTOS, "utf8");
  const lojasTextOrAbsent = (await fileExists(DADOS_LOJAS))
    ? await readFile(DADOS_LOJAS, "utf8")
    : "__NO_DADOS_LOJAS_FILE__";

  prisma = new PrismaClient();
  const result = await importOutputFromStrings(prisma, { produtosText, lojasTextOrAbsent });

  if (result.skipped) {
    console.log("Importação ignorada: este output já foi importado.");
    console.log("(ScrapeRun existente:", result.existingScrapeRunId, "| inputHash:", result.inputHash + ")");
    return;
  }

  console.log("--- Resumo importação ---");
  console.log("scrapeRunId:", result.scrapeRunId);
  console.log("produtos (itens) processados (upsert):", result.productsUpserted);
  console.log("vendedores únicos (IDs distintos no JSON):", result.uniqueSellerCount);
  console.log("productSnapshots criados:", result.productSnapshotsCreated);
  console.log("sellerSnapshots criados:", result.sellerSnapshotsCreated);
  console.log("rawPayload id:", result.rawPayloadId);
  console.log("-------------------------");
}

try {
  await importMain();
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  if (prisma) {
    await prisma.$disconnect();
  }
}
