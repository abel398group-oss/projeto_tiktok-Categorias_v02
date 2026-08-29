/**
 * Cobertura do catálogo — quanto do TikTok Shop BR o painel realmente viu.
 *
 * Motivo de existir: em 23/08/2026 a base tinha 55 das 212 subcategorias do
 * CATALOG (26%), e NENHUMA tela dizia isso. O Ranking anunciava "30 produtos ·
 * coleta de 22/08" e a pessoa lia aquilo como o mercado — quando era um quarto
 * dele. Estatística sobre amostra parcial apresentada sem a fração é a forma
 * mais educada de mentir, e o custo é real: decidir que produto promover
 * olhando um quarto do catálogo e achando que se olhou tudo.
 *
 * DUAS MÉTRICAS, NOMES DIFERENTES, NUNCA SOMADAS:
 *
 *   largura     — subcategorias com pelo menos um produto na base ÷ 212.
 *                 Honesta: numerador e denominador na mesma unidade.
 *
 *   profundidade— quantos produtos por categoria colhida. NÃO vira percentagem:
 *                 o TikTok não publica quantos produtos a subcategoria tem, e
 *                 sem denominador uma percentagem seria inventada. Fica como
 *                 mediana + mínimo, que são medição de verdade.
 *
 * O `product-seeker` tentou estimar a profundidade dividindo por um divisor
 * inferido e apagou a estimativa depois da primeira rodada real ("não há
 * divisor honesto enquanto a fração catalogada for desconhecida"). Mesmo
 * princípio aqui: falta número é informação, inventar não.
 */
import { CATALOG, keyForCat } from "../../scrape-all-categories.mjs";
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { getLatestAndBaselineRun } from "../_common.mjs";

/**
 * Abaixo disto o painel avisa que os números são amostra, não mercado.
 * 60% é o ponto em que a maioria das categorias já entrou — não é uma
 * fronteira estatística, é o limite a partir do qual parar de avisar deixa
 * de ser desonesto. Ajustável sem deploy pela env.
 */
export const COBERTURA_MINIMA_CONFIAVEL = Number(process.env.COBERTURA_MINIMA_PCT) || 60;

/** Mediana de uma lista de números (não ordenada). */
function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function getCoverageReport(prisma) {
  const produtos = await prisma.product.findMany({
    where: { categoryUrl: { not: null }, hiddenAt: null },
    select: { categoryUrl: true }
  });

  /** Quantos produtos por chave de categoria normalizada. */
  const porCategoria = new Map();
  for (const p of produtos) {
    const k = normalizeCategoryKey(p.categoryUrl);
    if (!k) continue;
    porCategoria.set(k, (porCategoria.get(k) ?? 0) + 1);
  }

  const doCatalogo = CATALOG.map((c) => ({
    label: c.label,
    slug: c.slug,
    id: c.id,
    key: normalizeCategoryKey(keyForCat(c))
  }));

  const cobertas = doCatalogo.filter((c) => (porCategoria.get(c.key) ?? 0) > 0);
  const vazias = doCatalogo.filter((c) => (porCategoria.get(c.key) ?? 0) === 0);
  const contagens = cobertas.map((c) => porCategoria.get(c.key));

  const pct = doCatalogo.length > 0 ? Math.round((cobertas.length / doCatalogo.length) * 100) : 0;

  /**
   * Cobertura DO RUN QUE O RANKING LÊ — e é esta que manda no aviso.
   *
   * A largura histórica acima conta tudo o que a base já viu alguma vez: mediu
   * 95% em 23/08/2026, porque `Product` acumula categoria de coletas de meses
   * atrás. Mas `product-score`, `growth` e `opportunities` leem os snapshots de
   * UM ScrapeRun — o mais recente. Se esse run cobriu 30 categorias, o ranking
   * "dos 30 melhores" saiu de 30 categorias, por mais completa que a base seja.
   *
   * Foi exactamente o erro que este ficheiro quase cometeu: mostrar 95% ao lado
   * de um ranking tirado de uma fatia, o que teria sido pior que não avisar
   * nada — um número tranquilizador e errado.
   */
  const { latest } = await getLatestAndBaselineRun(prisma);
  let ultimoRun = null;
  if (latest) {
    const snaps = await prisma.productSnapshot.findMany({
      where: { scrapeRunId: latest.id, product: { hiddenAt: null } },
      select: { product: { select: { categoryUrl: true } } }
    });
    const chavesNoRun = new Set();
    for (const s of snaps) {
      const k = normalizeCategoryKey(s.product?.categoryUrl);
      if (k) chavesNoRun.add(k);
    }
    const noCatalogo = doCatalogo.filter((c) => chavesNoRun.has(c.key)).length;
    const pctRun = doCatalogo.length > 0 ? Math.round((noCatalogo / doCatalogo.length) * 100) : 0;
    ultimoRun = {
      scrapeRunId: latest.id,
      collectedAt: latest.collectedAt.toISOString(),
      categoriasNoRun: noCatalogo,
      categoriasNoCatalogo: doCatalogo.length,
      pct: pctRun,
      confiavel: pctRun >= COBERTURA_MINIMA_CONFIAVEL,
      snapshots: snaps.length
    };
  }

  /**
   * Avisos derivados do banco, não escritos à mão: quando o problema sai dos
   * dados, o aviso sai da tela sozinho — em vez de ficar um texto velho a
   * assustar quem já resolveu.
   */
  const avisos = [];
  if (ultimoRun && !ultimoRun.confiavel) {
    avisos.push(
      `A última coleta cobriu ${ultimoRun.pct}% das subcategorias ` +
      `(${ultimoRun.categoriasNoRun} de ${ultimoRun.categoriasNoCatalogo}). Ranking, crescimento e ` +
      `oportunidades leem só esta coleta — descrevem esta fatia, não o TikTok Shop.`
    );
  }
  if (pct < COBERTURA_MINIMA_CONFIAVEL) {
    avisos.push(
      `Só ${pct}% das subcategorias do catálogo têm produto na base ` +
      `(${cobertas.length} de ${doCatalogo.length}).`
    );
  }
  if (vazias.length > 0) {
    avisos.push(`${vazias.length} subcategoria(s) nunca entraram — nenhum produto delas pode aparecer em relatório nenhum.`);
  }

  return {
    ultimoRun,
    largura: {
      categoriasComProduto: cobertas.length,
      categoriasNoCatalogo: doCatalogo.length,
      pct,
      confiavel: pct >= COBERTURA_MINIMA_CONFIAVEL,
      minimoParaConfiavel: COBERTURA_MINIMA_CONFIAVEL
    },
    profundidade: {
      // Sem denominador publicado pelo TikTok, isto NÃO é percentagem de
      // cobertura da categoria — é só quanto se colheu. Ver cabeçalho.
      produtosPorCategoriaMediana: mediana(contagens),
      produtosPorCategoriaMin: contagens.length ? Math.min(...contagens) : null,
      produtosPorCategoriaMax: contagens.length ? Math.max(...contagens) : null,
      nota: "O TikTok não publica o total de produtos por subcategoria; sem denominador, profundidade não vira percentagem."
    },
    totalProdutosVisiveis: produtos.length,
    categoriasVazias: vazias.slice(0, 30).map((c) => c.label),
    avisos,
    medidoEm: new Date().toISOString()
  };
}
