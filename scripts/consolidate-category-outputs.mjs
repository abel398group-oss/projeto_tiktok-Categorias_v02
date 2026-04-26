/**
 * Consolida ficheiros em output/categorias (cada subpasta) para o padrão antigo:
 *   output/dados_produtos.json
 *   output/dados_lojas.json
 *
 * Apenas leitura + concatenação + dedupe por product_id / seller_id (sem alterar itens).
 * Ordem de pastas alinhada a scripts/scrape-both.mjs — o primeiro ocorrido ganha no dedupe.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "output");
const categoriasRoot = path.join(outDir, "categorias");

/** Mesma ordem de `scripts/scrape-both.mjs` — dedupe: primeiro ficheiro/pasta vence. */
const CATEGORIA_DIR_ORDER = [
  "womenswear-underwear",
  "roupas-intimas-femininas",
];

function orderCategoryDirs(fetched) {
  const set = new Set(fetched);
  const first = CATEGORIA_DIR_ORDER.filter((d) => set.has(d));
  const rest = [...fetched]
    .filter((d) => !CATEGORIA_DIR_ORDER.includes(d))
    .sort();
  return [...first, ...rest];
}

function keyId(v) {
  if (v == null) return null;
  return String(v);
}

function normalizeStatusList(statuses) {
  const uniq = [...new Set(statuses)];
  if (uniq.length === 0) return "ok";
  if (uniq.length === 1) return uniq[0];
  if (uniq.every((s) => s === "ok")) return "ok";
  return "partial";
}

async function main() {
  let dirNames;
  try {
    const entries = await fs.readdir(categoriasRoot, { withFileTypes: true });
    dirNames = orderCategoryDirs(
      entries.filter((e) => e.isDirectory()).map((e) => e.name)
    );
  } catch (e) {
    if (e && e.code === "ENOENT") {
      // eslint-disable-next-line no-console
      console.error("consolidate: pasta ausente", categoriasRoot);
      process.exit(1);
    }
    throw e;
  }

  if (dirNames.length === 0) {
    // eslint-disable-next-line no-console
    console.error("consolidate: nenhuma subpasta em", categoriasRoot);
    process.exit(1);
  }

  const productById = new Map();
  const lojaBySeller = new Map();
  const statusList = [];
  const rawTotals = { produtos: 0, lojas: 0 };

  for (const d of dirNames) {
    const proPath = path.join(categoriasRoot, d, "dados_produtos.json");
    const lojPath = path.join(categoriasRoot, d, "dados_lojas.json");

    let prodJson;
    let lojJson;
    try {
      const [pRaw, lRaw] = await Promise.all([
        fs.readFile(proPath, "utf8"),
        fs.readFile(lojPath, "utf8"),
      ]);
      prodJson = JSON.parse(pRaw);
      lojJson = JSON.parse(lRaw);
    } catch (e) {
      if (e && (e.code === "ENOENT" || e instanceof SyntaxError)) {
        // eslint-disable-next-line no-console
        console.error(
          `consolidate: falha a ler/parsing em ${d}:`,
          e.message || e
        );
        process.exit(1);
      }
      throw e;
    }

    if (prodJson.status != null) statusList.push(String(prodJson.status));
    if (Array.isArray(prodJson.itens)) {
      rawTotals.produtos += prodJson.itens.length;
      for (const item of prodJson.itens) {
        const id = keyId(item.product_id);
        if (!id) continue;
        if (!productById.has(id)) productById.set(id, item);
      }
    }
    if (Array.isArray(lojJson.lojas)) {
      rawTotals.lojas += lojJson.lojas.length;
      for (const L of lojJson.lojas) {
        const sid = keyId(L.seller_id);
        if (!sid) continue;
        if (!lojaBySeller.has(sid)) lojaBySeller.set(sid, L);
      }
    }
  }

  const itens = [...productById.values()];
  const lojas = [...lojaBySeller.values()];

  const coletadoEm = new Date().toISOString();

  const outProd = {
    coletado_em: coletadoEm,
    categoria_url: "multiple",
    final_url: "multiple",
    status: normalizeStatusList(statusList),
    total: itens.length,
    filtro: "coleta multi-categorias consolidada",
    itens,
  };

  const outLojas = {
    coletado_em: coletadoEm,
    total: lojas.length,
    lojas,
  };

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(outDir, "dados_produtos.json"),
      JSON.stringify(outProd, null, 2),
      "utf8"
    ),
    fs.writeFile(
      path.join(outDir, "dados_lojas.json"),
      JSON.stringify(outLojas, null, 2),
      "utf8"
    ),
  ]);

  // eslint-disable-next-line no-console
  console.log("consolidate: ok", {
    pastas: dirNames.length,
    itens_antes_dedupe: rawTotals.produtos,
    itens_apos: itens.length,
    lojas_antes_dedupe: rawTotals.lojas,
    lojas_apos: lojas.length,
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
