/**
 * O núcleo de um título: a palavra que diz O QUE é o produto.
 *
 * ┌─ PARA QUE SERVE ─────────────────────────────────────────────────────
 * │ 1. O prompt do Symphony precisa de "sapatilha náutica de neoprene",
 * │    não do título de 120 caracteres com "KIT PROMOÇÃO FRETE GRÁTIS".
 * │ 2. A mediana de preço de uma categoria não pode ser puxada por
 * │    acessório mal arquivado ("suporte para vara" numa categoria de
 * │    varas de pesca é outro produto, com outro preço).
 * └──────────────────────────────────────────────────────────────────────
 *
 * NÃO é similaridade de texto. "Suporte para vara de pesca" casa três
 * palavras com "vara de pesca telescópica" e é outra coisa. O que identifica
 * o produto é o primeiro substantivo útil.
 *
 * Adaptado do `ml-nucleos.js` do product-seeker, com as listas recalibradas
 * para o TikTok BR: medido em 4.000 títulos da nossa base, **"kit" abre 19%
 * deles**. Sem a lista de embalagem, um quinto do catálogo teria "kit" como
 * núcleo — e "kit" não é produto nenhum.
 *
 * As listas são pequenas de propósito. A tentação é crescê-las até apanhar
 * todos os casos; a lição do repo irmão é que uma dúzia de palavras bem
 * escolhidas bate duzentas mal escolhidas. Só crescer com caso real que
 * falhou, e com teste a acompanhar.
 *
 * Zero rede, zero modelo: uma passada nos títulos que já estão em casa.
 */

/** Embalagem e promoção: dizem como vem, não o que é. */
const PULAR = new Set(
  ("kit kits combo combos jogo jogos conjunto conjuntos par pares caixa caixas " +
   "pacote pack unidade unidades und un pcs pc peca pecas lote atacado " +
   "novo nova novos novas original originais promocao promocional oferta " +
   "frete gratis desconto barato importado nacional linha colecao " +
   // medido em lote de curadoria: titulos que abrem com o preco, nao com o produto
   "preco precos liquidacao saldao queima estoque exclusivo lancamento " +
   "com sem para por de da do das dos em no na nos nas e ou a o as os um uma " +
   // pronomes e demonstrativos nunca nomeiam produto
   "meu minha meus minhas seu sua seus suas teu tua nosso nossa este esta " +
   "esse essa aquele aquela isso aquilo aqui ali la voce voces todo toda")
    .split(" ")
);

/**
 * Qualificadores: descrevem o produto, não o nomeiam. Prefixo, não palavra
 * inteira, porque o género e o plural variam ("eletrico", "eletrica").
 */
const QUALIF = [
  "eletric", "manua", "portat", "profission", "industria", "automatic",
  "digital", "recarregav", "magnetic", "solar", "domestic", "descartav",
  "feminin", "masculin", "unissex", "infantil", "adulto", "juvenil",
  "grande", "pequen", "medi", "super", "mini", "micro", "maxi", "ultra",
  "premium", "luxo", "top", "antiderrapa", "impermeav", "ajustav"
];

/** Material é resposta de segunda: melhor "sapatilha" do que "neoprene". */
const MATERIAL = new Set(
  ("inox aco ferro aluminio plastico silicone borracha couro algodao poliester " +
   "neoprene nylon vidro madeira ceramica bambu linho seda la jeans lycra")
    .split(" ")
);

/** A gôndola É o consumível: vende-se o aparelho uma vez, o refil dezenas. */
const RECOMPRA = new Set(
  ("refil refis cartucho cartuchos lamina laminas capsula capsulas filtro filtros " +
   "sabonete shampoo condicionador creme serum locao pomada mascara esmalte " +
   "racao suplemento vitamina fralda absorvente algodao cotonete")
    .split(" ")
);

/** Compra única que acompanha outro produto. */
const ACESSORIO = new Set(
  ("suporte suportes base bases adaptador adaptadores capa capas bolsa bolsas " +
   "estojo estojos bandeja cabo cabos carregador alca alcas presilha gancho " +
   "protetor pelicula adesivo adesivos etiqueta organizador")
    .split(" ")
);

const semAcento = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const palavras = (t) => semAcento(t).match(/[a-z0-9]+/g) ?? [];

const eQualificador = (w) => QUALIF.some((p) => w.startsWith(p));

/**
 * Radical grosseiro, só para o plural do português.
 *
 * A primeira versão cortava só "s": `refis → refi`, e `refil` e `refis`
 * deixavam de casar. As terminações irregulares vêm antes da regra geral.
 */
export function radical(w) {
  if (w.length <= 3) return w;
  for (const [fim, troca] of [["oes", "ao"], ["aes", "ao"], ["ais", "al"], ["eis", "el"], ["ois", "ol"], ["is", "il"]]) {
    if (w.endsWith(fim) && w.length > fim.length + 1) return w.slice(0, -fim.length) + troca;
  }
  if (w.endsWith("ns")) return w.slice(0, -2) + "m";
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * O núcleo de um título.
 *
 * Três degraus, do mais exigente ao menos, para nunca devolver nulo à toa:
 * primeiro uma palavra que não seja material, depois tolerando material,
 * depois qualquer candidato. Título sem candidato nenhum devolve null — e aí
 * é mesmo título vazio ou só de números.
 *
 * @param {unknown} titulo
 * @returns {string | null}
 */
export function nucleoDoTitulo(titulo) {
  const cand = palavras(titulo).filter(
    (w) => w.length >= 3 && !/^\d/.test(w) && !PULAR.has(w) && !eQualificador(w)
  );
  const escolhido = cand.find((w) => !MATERIAL.has(w)) ?? cand[0];
  return escolhido ? radical(escolhido) : null;
}

/**
 * Que tipo de negócio é este produto.
 *
 * Derivada do núcleo, não de julgamento por ficha. Serve dois filtros: o
 * pacote evita acessório sozinho (vídeo de "capa" sem o telemóvel não vende),
 * e `recompra` cruzada com giro provado é a lista de comissão recorrente.
 *
 * @param {unknown} titulo
 * @returns {"recompra" | "acessorio" | "produto"}
 */
export function especieDoTitulo(titulo) {
  const n = nucleoDoTitulo(titulo);
  if (!n) return "produto";
  const cru = palavras(titulo).find((w) => radical(w) === n) ?? n;
  if (RECOMPRA.has(cru) || RECOMPRA.has(n)) return "recompra";
  if (ACESSORIO.has(cru) || ACESSORIO.has(n)) return "acessorio";
  return "produto";
}

/**
 * Nome curto e legível — o que vai para o prompt e para a pasta do pacote.
 *
 * Núcleo mais os qualificadores que vêm logo a seguir, até `maxPalavras`.
 * Os qualificadores importam: "sapatilha" sozinho é vago, "sapatilha náutica
 * neoprene" é o produto. Mas param onde começa o ruído de anúncio.
 *
 * @param {unknown} titulo
 * @param {{ maxPalavras?: number }} [opcoes]
 * @returns {string | null}
 */
export function rotuloCurto(titulo, opcoes = {}) {
  const max = opcoes.maxPalavras ?? 4;
  const todas = palavras(titulo);
  const n = nucleoDoTitulo(titulo);
  if (!n) return null;

  const inicio = todas.findIndex((w) => radical(w) === n);
  if (inicio < 0) return null;

  const saida = [todas[inicio]];
  for (let i = inicio + 1; i < todas.length && saida.length < max; i++) {
    const w = todas[i];
    if (PULAR.has(w) || /^\d/.test(w) || w.length < 3) break;
    saida.push(w);
  }
  return saida.join(" ");
}

/**
 * A ficha está na categoria certa?
 *
 * `confere`     núcleo igual ao da categoria — é o produto da prateleira.
 * `fora`        núcleo diferente E o núcleo da categoria aparece adiante no
 *               título ("suporte para VARA"): é acessório DO produto. É a
 *               única classe com evidência POSITIVA de ser outra coisa, e a
 *               única que sai das medianas.
 * `indefinido`  núcleo diferente e a palavra da categoria nem aparece. Pode
 *               ser sinónimo, erro de título, ou produto legítimo com outro
 *               nome. NA DÚVIDA NÃO EXCLUI.
 *
 * @param {unknown} tituloProduto
 * @param {unknown} nomeCategoria
 * @returns {"confere" | "fora" | "indefinido"}
 */
export function vereditoNaCategoria(tituloProduto, nomeCategoria) {
  const np = nucleoDoTitulo(tituloProduto);
  const nc = nucleoDoTitulo(nomeCategoria);
  if (!np || !nc) return "indefinido";
  if (np === nc) return "confere";

  const apareceAdiante = palavras(tituloProduto).some((w) => radical(w) === nc);
  return apareceAdiante ? "fora" : "indefinido";
}
