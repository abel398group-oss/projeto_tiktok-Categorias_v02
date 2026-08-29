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

/**
 * Campos de MÍDIA que só o enriquecimento de PDP produz — a coleta de categoria
 * nunca os traz (a grelha só dá a miniatura).
 *
 * Só mídia entra nesta lista, e é de propósito: preço, vendas, nota e stock TÊM
 * de vir frescos da coleta. Preservar um preço antigo aqui seria anunciar valor
 * errado — o oposto do que se quer.
 */
const CAMPOS_MIDIA_ENRIQUECIDA = ["fotos_pdp", "fotos_review", "videos_review"];

/** @param {unknown} v */
function temConteudo(v) {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Devolve ao lote consolidado a mídia enriquecida que já existia.
 *
 * PORQUE EXISTE (incidente de 29/08/2026): esta consolidação reconstrói o
 * `output/dados_produtos.json` do ZERO a partir de `output/categorias/*`, e o
 * `pdp:enrich` grava a galeria SÓ no ficheiro consolidado — nunca volta à pasta
 * da categoria. Resultado: cada coleta nova apagava todo o enriquecimento já
 * feito, e cada produto voltava a ter uma única miniatura. Como o gerador de
 * vídeo monta o vídeo com as fotos do produto, "1 foto" significa a MESMA
 * imagem do princípio ao fim — foi assim que saiu o vídeo estático que motivou
 * esta investigação. Medido na altura: 20 658 produtos na base, ZERO com
 * `fotos_pdp`, apesar de haver enriquecimentos feitos dias antes.
 *
 * Preserva por produto e por campo: se a coleta nova trouxer o campo, ela ganha;
 * só se herda o que se perderia.
 *
 * @param {Array<Record<string, unknown>>} itens — lote novo, alterado no lugar
 * @returns {Promise<{ produtos: number, campos: number }>}
 */
async function preservarMidiaEnriquecida(itens) {
  let anterior;
  try {
    anterior = JSON.parse(await fs.readFile(path.join(outDir, "dados_produtos.json"), "utf8"));
  } catch {
    // Primeira consolidação (ou ficheiro ilegível): não há nada a preservar, e
    // isso não é erro — a coleta nova é a única fonte que existe.
    return { produtos: 0, campos: 0 };
  }

  const antesPorId = new Map();
  for (const it of Array.isArray(anterior?.itens) ? anterior.itens : []) {
    const id = keyId(it?.product_id);
    if (id) antesPorId.set(id, it);
  }
  if (antesPorId.size === 0) return { produtos: 0, campos: 0 };

  let produtos = 0;
  let campos = 0;
  for (const item of itens) {
    const antes = antesPorId.get(keyId(item?.product_id));
    if (!antes) continue;
    let tocado = false;
    for (const campo of CAMPOS_MIDIA_ENRIQUECIDA) {
      if (!temConteudo(item[campo]) && temConteudo(antes[campo])) {
        item[campo] = antes[campo];
        campos += 1;
        tocado = true;
      }
    }
    if (tocado) produtos += 1;
  }
  return { produtos, campos };
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
      if (e && e.code === "ENOENT") {
        // Subpasta de categoria sem dados_*.json (coleta parcial/abortada, ex.: só a pasta `extra/`).
        // Ignorar e continuar — senão um único resíduo aborta toda a consolidação e o import seguinte.
        // eslint-disable-next-line no-console
        console.warn(
          `consolidate: subpasta ignorada (sem dados_*.json — coleta parcial?): ${d}`
        );
        continue;
      }
      if (e instanceof SyntaxError) {
        // eslint-disable-next-line no-console
        console.error(`consolidate: JSON inválido em ${d}:`, e.message || e);
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

  const preservados = await preservarMidiaEnriquecida(itens);

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
    // Sai sempre, mesmo a zero: foi precisamente por esta operação ser
    // silenciosa que a perda de galerias passou despercebida durante dias.
    midia_preservada_produtos: preservados.produtos,
    midia_preservada_campos: preservados.campos,
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
