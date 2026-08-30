/**
 * Extrair o product_id de um link de produto do TikTok Shop.
 *
 * Serve o caso de descobrir um produto a NAVEGAR, e não pela coleta: vês algo
 * bom na app, copias o link, e queres a galeria limpa sem esperar que uma
 * coleta de categoria passe por ali. Sem isto o `pdp:enrich` respondia
 * "produto não existe no output nem na base" e não havia caminho nenhum.
 *
 * Formatos que aparecem na prática:
 *   https://shop.tiktok.com/br/pdp/1730000000000000000
 *   https://www.tiktok.com/shop/br/pdp/nome-do-produto/1730000000000000000
 *   https://www.tiktok.com/view/product/1730000000000000000?...
 *   https://vt.tiktok.com/XXXXX/            <- encurtado, NAO dá para resolver
 *                                              sem seguir o redireccionamento
 */

/** Os ids do TikTok Shop são inteiros longos (19 dígitos na prática). */
const ID = /(?:^|\/|=)(\d{15,21})(?:\/|\?|$)/;

/**
 * @param {unknown} entrada link ou o próprio id
 * @returns {string | null} o product_id, ou null se não der para extrair
 */
export function productIdDeUrl(entrada) {
  const t = typeof entrada === "string" ? entrada.trim() : "";
  if (t === "") return null;

  // Já é um id nu.
  if (/^\d{15,21}$/.test(t)) return t;

  let alvo = t;
  try {
    const u = new URL(t);
    // `?id=` aparece nalgumas variantes de partilha.
    const doQuery = u.searchParams.get("id") ?? u.searchParams.get("product_id");
    if (doQuery && /^\d{15,21}$/.test(doQuery)) return doQuery;
    alvo = u.pathname;
  } catch {
    // não é URL válida — tentamos o texto cru na mesma
  }

  const m = alvo.match(ID);
  return m ? m[1] : null;
}

/**
 * Item mínimo para o enriquecimento arrancar a partir de um link.
 *
 * Só leva o que dá para saber sem abrir o navegador: o id e a URL. Tudo o
 * resto — nome, preço, vendas, galeria — vem da visita à PDP, que é o trabalho
 * do enriquecimento. Inventar valores aqui só criaria dados falsos à espera de
 * serem sobrescritos.
 *
 * @param {string} productId
 * @param {string} [url]
 */
export function itemMinimoDeUrl(productId, url = "") {
  return {
    product_id: productId,
    nome: null,
    link_produto: url || `https://shop.tiktok.com/br/pdp/${encodeURIComponent(productId)}`,
    categoria_url: null,
    moeda: null,
    preco: null,
    vendas: null,
    fotos: null,
    fotos_pdp: null,
    origem: "link-directo"
  };
}

/** Domínios de encurtador do TikTok que sabemos existirem. */
const ENCURTADOR = /^(vt|vm)\.tiktok\.com$/i;

/** @param {string} url */
export function eLinkEncurtado(url) {
  try {
    return ENCURTADOR.test(new URL(String(url).trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve um link encurtado seguindo o redireccionamento.
 *
 * É o que o botão de partilha do Android produz — `vt.tiktok.com/ZS9.../` —
 * por isso é o formato que mais aparece na prática, não um caso de canto.
 *
 * O primeiro salto já traz a PDP com o id; o segundo manda para o /login
 * quando não há sessão. Por isso lemos os `location` pela ordem e ficamos com
 * o PRIMEIRO que dê id — seguir até ao fim levaria à página de login, que não
 * tem id nenhum.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, maxSaltos?: number }} [opcoes]
 * @returns {Promise<string | null>}
 */
export async function resolverEncurtado(url, opcoes = {}) {
  const f = opcoes.fetchImpl ?? fetch;
  const maxSaltos = opcoes.maxSaltos ?? 5;
  let actual = String(url).trim();

  for (let i = 0; i < maxSaltos; i++) {
    let res;
    try {
      res = await f(actual, {
        method: "HEAD",
        redirect: "manual",
        headers: { "user-agent": UA }
      });
    } catch {
      return null;
    }
    const proximo = res.headers?.get?.("location");
    if (!proximo) return null;

    const id = productIdDeUrl(proximo);
    if (id) return id;

    actual = new URL(proximo, actual).toString();
  }
  return null;
}

/** Sem user-agent de browser o encurtador responde de forma diferente. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
