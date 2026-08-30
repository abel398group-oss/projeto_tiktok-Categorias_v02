/**
 * Estatísticas por categoria — medianas, percentis e quadrantes.
 *
 * Higiene estatística portada do product-seeker, na ordem em que ela evita
 * mentiras:
 *
 * 1. MEDIANA, nunca média: uma categoria com 40 produtos de R$ 20 e um de
 *    R$ 800 tem média R$ 39 — número que não descreve nenhum produto real.
 * 2. p25–p75 como faixa: "preço típico R$ 18–32" informa mais do que qualquer
 *    número sozinho, porque mostra a dispersão.
 * 3. Quadrantes pelas MEDIANAS DO PRÓPRIO CONJUNTO, não por corte fixo: um
 *    corte escrito hoje envelhece; a mediana acompanha os dados sozinha.
 * 4. `n` viaja com cada número: estatística de 4 produtos é anedota e tem de
 *    se apresentar como tal.
 */
import { normalizeCategoryKey } from "./categories-catalog.mjs";
import { parseCategory } from "./parse-category.mjs";
import { getLatestAndBaselineRun } from "../_common.mjs";

/** Mediana de uma lista já filtrada de números. */
export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Percentil (0–100) por interpolação linear — p25/p75 para faixas típicas. */
export function percentil(valores, p) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (p / 100) * (v.length - 1);
  const base = Math.floor(pos);
  const resto = pos - base;
  return v[base + 1] != null ? v[base] + resto * (v[base + 1] - v[base]) : v[base];
}

const arred = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * Estatísticas de um conjunto de linhas de produto (mesma forma do relatório
 * de score: preco, vendas, vendasPorDia, ratingAverage, loja).
 *
 * @param {Array<Record<string, any>>} linhas
 */
export function calcularEstatisticas(linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const n = lista.length;

  const precos = lista.map((l) => Number(l?.preco)).filter((x) => Number.isFinite(x) && x > 0);
  const vendas = lista
    .map((l) => Number(String(l?.vendas ?? "").replace(/[^\d]/g, "")))
    .filter((x) => Number.isFinite(x) && x >= 0);
  const ritmos = lista
    .map((l) => (l?.crescimentoMedido ? Number(l?.vendasPorDia) : NaN))
    .filter((x) => Number.isFinite(x));
  const notas = lista.map((l) => Number(l?.ratingAverage)).filter((x) => Number.isFinite(x) && x > 0);
  const lojas = new Set(lista.map((l) => String(l?.loja ?? "")).filter((s) => s && s !== "—"));

  return {
    n,
    preco: {
      mediana: arred(mediana(precos)),
      p25: arred(percentil(precos, 25)),
      p75: arred(percentil(precos, 75)),
      n: precos.length
    },
    vendas: { mediana: arred(mediana(vendas)), n: vendas.length },
    vendasPorDia: {
      mediana: arred(mediana(ritmos)),
      // Total do ritmo medido: aproxima o giro diário da categoria inteira.
      totalMedido: arred(ritmos.reduce((s, x) => s + x, 0)),
      n: ritmos.length
    },
    nota: { mediana: arred(mediana(notas)), n: notas.length },
    lojas: lojas.size,
    concorrencia: perfilDeConcorrencia(lista)
  };
}

/**
 * Forma da concorrência na categoria: pulverizada ou dominada por uma loja?
 *
 * Contar lojas distintas não responde à pergunta que importa para quem promove
 * como afiliado. Vinte lojas com uma delas a fazer 80% das vendas é briga com
 * incumbente; vinte lojas repartidas é espaço. O número de lojas é o mesmo nos
 * dois casos — por isso `lojas: 20` sozinho não decide nada.
 *
 * Ideia vinda do `perfilDaVitrine` do product-seeker: um agregado por categoria
 * que classifica o FORMATO da concorrência e devolve um rótulo legível. Lá era
 * sobre tipos de anúncio do Mercado Livre; aqui é sobre quem detém as vendas.
 *
 * Os cortes (50% / 25%) são convenção declarada, não medição — por isso viajam
 * no resultado (`cortes`) em vez de ficarem escondidos no código. E `n` viaja
 * junto: concentração medida sobre 4 produtos é anedota, não estrutura.
 */
export function perfilDeConcorrencia(linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  /** @type {Map<string, number>} */
  const porLoja = new Map();
  let total = 0;

  for (const l of lista) {
    const loja = String(l?.loja ?? "").trim();
    if (!loja || loja === "—") continue;
    const v = Number(String(l?.vendas ?? "").replace(/[^\d]/g, ""));
    if (!Number.isFinite(v) || v <= 0) continue;
    porLoja.set(loja, (porLoja.get(loja) ?? 0) + v);
    total += v;
  }

  // Sem vendas atribuídas a loja não há concentração a medir — e dizer isso é
  // melhor do que devolver 0%, que se leria como "perfeitamente pulverizada".
  if (total <= 0 || porLoja.size === 0) {
    return { medida: false, motivo: "sem vendas atribuídas a loja", lojasComVenda: 0 };
  }

  const ordenadas = [...porLoja.entries()].sort((a, b) => b[1] - a[1]);
  const pct = (n) => Math.round((n / total) * 1000) / 10;
  const topLoja = pct(ordenadas[0][1]);
  const top3 = pct(ordenadas.slice(0, 3).reduce((s, [, v]) => s + v, 0));
  const produtosComVenda = lista.filter(
    (l) => Number(String(l?.vendas ?? "").replace(/[^\d]/g, "")) > 0
  ).length;

  /**
   * Abaixo disto a concentração não descreve a categoria, descreve a amostra.
   *
   * A primeira execução provou-o: as categorias que apareceram como "mais
   * dominadas" tinham TODAS um único produto com venda — 100% numa loja porque
   * só havia uma loja. Ordenar por concentração assim devolveria uma lista das
   * categorias mais VAZIAS, não das mais disputadas, e a leitura seria o
   * oposto da verdade.
   */
  const MIN_PRODUTOS_PARA_LER = 8;
  const amostraSuficiente = produtosComVenda >= MIN_PRODUTOS_PARA_LER;

  const leitura = !amostraSuficiente
    ? "amostra pequena"
    : topLoja >= 50
      ? "dominada"
      : top3 >= 25
        ? "concentrada"
        : "pulverizada";

  return {
    medida: true,
    lojasComVenda: ordenadas.length,
    // `n` da medição: quantos produtos entraram na conta de concentração.
    produtosComVenda,
    amostraSuficiente,
    minProdutosParaLer: MIN_PRODUTOS_PARA_LER,
    topLojaPct: topLoja,
    topLojaNome: ordenadas[0][0],
    top3Pct: top3,
    leitura,
    cortes: { dominada: "top1 ≥ 50%", concentrada: "top3 ≥ 25%", minimo: `${MIN_PRODUTOS_PARA_LER} produtos com venda` }
  };
}

/**
 * Quadrante de cada produto pelas medianas do PRÓPRIO conjunto:
 * preço vs mediana × ritmo vs mediana dos medidos.
 *
 *   barato + girando  → "porta aberta"  (fácil de vender, entra já)
 *   caro   + girando  → "vale o ângulo" (gira mesmo caro: comissão maior, exige vídeo melhor)
 *   barato + parado   → "sem tração"    (nem barato convence — desconfiar do produto)
 *   caro   + parado   → "evitar"        (caro e ninguém compra)
 *
 * Produtos sem ritmo medido ficam fora (quadrante exige as duas medidas).
 *
 * @param {Array<Record<string, any>>} linhas
 */
export function classificarQuadrantes(linhas) {
  const lista = Array.isArray(linhas) ? linhas : [];
  const medidos = lista.filter(
    (l) => l?.crescimentoMedido && Number.isFinite(Number(l?.vendasPorDia)) && Number.isFinite(Number(l?.preco)) && Number(l?.preco) > 0
  );
  const MINIMO = 4;
  if (medidos.length < MINIMO) {
    return { ok: false, motivo: `só ${medidos.length} produto(s) com preço e ritmo medidos — quadrante com menos de ${MINIMO} é anedota`, quadrantes: null };
  }

  const medPreco = mediana(medidos.map((l) => Number(l.preco)));
  const medRitmo = mediana(medidos.map((l) => Number(l.vendasPorDia)));

  /** @type {Record<string, string[]>} */
  const grupos = { porta_aberta: [], vale_o_angulo: [], sem_tracao: [], evitar: [] };
  for (const l of medidos) {
    const caro = Number(l.preco) > medPreco;
    const girando = Number(l.vendasPorDia) > medRitmo;
    const chave = girando ? (caro ? "vale_o_angulo" : "porta_aberta") : caro ? "evitar" : "sem_tracao";
    grupos[chave].push(String(l.productId ?? ""));
  }

  return {
    ok: true,
    cortes: { precoMediano: arred(medPreco), ritmoMediano: arred(medRitmo) },
    nMedidos: medidos.length,
    quadrantes: grupos
  };
}

/**
 * Relatório completo por categoria, agrupando as linhas de score já calculadas.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {(prisma: any) => Promise<{ lines?: Array<Record<string, any>> }>} obterLinhas
 */
export async function getCategoryStatsReport(prisma, obterLinhas) {
  const { latest, baseline, janelaHoras } = await getLatestAndBaselineRun(prisma);
  if (!latest) {
    return { categorias: [], message: "Sem dados: nenhum ScrapeRun. Importe primeiro." };
  }

  const b = await obterLinhas(prisma);
  const linhas = Array.isArray(b?.lines) ? b.lines : [];

  /** @type {Map<string, Array<Record<string, any>>>} */
  const porCategoria = new Map();
  for (const l of linhas) {
    const rotulo = [l?.categoriaPrincipal, l?.subcategoria].filter((x) => x && x !== "—").join(" · ") || "(sem categoria)";
    const grupo = porCategoria.get(rotulo);
    if (grupo) grupo.push(l);
    else porCategoria.set(rotulo, [l]);
  }

  const categorias = [...porCategoria.entries()]
    .map(([rotulo, grupo]) => ({
      categoria: rotulo,
      estatisticas: calcularEstatisticas(grupo),
      quadrantes: classificarQuadrantes(grupo)
    }))
    .sort((a, b2) => (b2.estatisticas.vendasPorDia.totalMedido ?? 0) - (a.estatisticas.vendasPorDia.totalMedido ?? 0));

  classificarOportunidadeDeCategoria(categorias);

  return {
    scrapeRun: { id: latest.id, collectedAt: latest.collectedAt.toISOString() },
    baselineRun: baseline ? { id: baseline.id, collectedAt: baseline.collectedAt.toISOString() } : null,
    janelaHoras: janelaHoras != null ? Math.round(janelaHoras * 10) / 10 : null,
    totalProdutos: linhas.length,
    categorias
  };
}

/**
 * Onde vale a pena trabalhar: giro da categoria × quão disputada ela é.
 *
 * O painel ordenava produtos e nunca CATEGORIAS. Só que a primeira decisão de
 * quem promove não é "qual produto", é "qual prateleira" — e as duas coisas que
 * a determinam já estavam medidas em separado sem nunca se cruzarem: o giro
 * (vendas/dia somadas) e a concentração (quem detém as vendas).
 *
 * Dois eixos em vez de uma nota, de propósito. Uma pontuação única de 74 não
 * diria se veio de giro alto ou de concorrência fraca, e as duas pedem
 * decisões diferentes: giro alto com dono é guerra; giro médio pulverizado é
 * porta aberta. É a mesma razão pela qual `classificarQuadrantes` existe ao
 * nível do produto.
 *
 * O corte do giro é a MEDIANA das categorias medidas, não uma constante: um
 * "acima de 500/dia" escrito hoje envelhece, a mediana acompanha os dados. Só
 * entram categorias com giro medido e concentração com amostra suficiente —
 * as outras ficam `null`, que é diferente de "má".
 *
 * @param {Array<{ estatisticas: any, oportunidade?: any }>} categorias — mutado no lugar
 */
export function classificarOportunidadeDeCategoria(categorias) {
  const elegiveis = categorias.filter((c) => {
    const e = c.estatisticas;
    return (
      e?.vendasPorDia?.n > 0 &&
      Number.isFinite(Number(e?.vendasPorDia?.totalMedido)) &&
      e?.concorrencia?.medida &&
      e.concorrencia.amostraSuficiente
    );
  });

  // Sem conjunto não há mediana, e sem mediana não há corte honesto.
  if (elegiveis.length < 4) {
    for (const c of categorias) {
      c.oportunidade = { classificada: false, motivo: "conjunto pequeno demais para tirar a mediana do giro" };
    }
    return categorias;
  }

  const corteGiro = mediana(elegiveis.map((c) => Number(c.estatisticas.vendasPorDia.totalMedido)));

  for (const c of categorias) {
    const e = c.estatisticas;
    if (!elegiveis.includes(c)) {
      c.oportunidade = {
        classificada: false,
        motivo: !e?.concorrencia?.medida || !e.concorrencia.amostraSuficiente
          ? "concorrência sem amostra suficiente"
          : "sem giro medido nesta janela"
      };
      continue;
    }
    const giro = Number(e.vendasPorDia.totalMedido);
    const giraMuito = giro >= corteGiro;
    const temDono = e.concorrencia.leitura === "dominada";

    c.oportunidade = {
      classificada: true,
      giroDia: Math.round(giro),
      corteGiro: Math.round(corteGiro),
      giraMuito,
      concorrencia: e.concorrencia.leitura,
      // Nomes que dizem o que fazer, não notas que exigem interpretação.
      leitura: giraMuito
        ? temDono ? "gira, mas tem dono" : "porta aberta"
        : temDono ? "evitar" : "pouco movimento"
    };
  }
  return categorias;
}

// Reexporta para quem consome o relatório poder normalizar chaves da mesma forma.
export { normalizeCategoryKey, parseCategory };
