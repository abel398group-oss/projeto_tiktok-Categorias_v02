/**
 * Pedir ao CDN do TikTok a versão grande de uma imagem.
 *
 * As URLs das fotos de avaliação vêm do `<img src>` da página, e a página
 * mostra miniaturas. O tamanho está embutido no próprio caminho, num molde do
 * CDN:
 *
 *   .../4416fe2a...~tplv-aphluv4xwc-crop-webp:300:300.webp?dr=15592&...
 *                                            ^^^^^^^
 *
 * Medido em 30/08/2026: as 15 fotos de clientes do Pro3Magnésio estavam
 * guardadas a 300x300 (e algumas a 100x100). Trocando o par por 1080:1080 o
 * mesmo CDN devolve 1080x1080 — a foto grande sempre lá esteve.
 *
 * Isto não é cosmética: a 300x300 a foto não enche um fotograma 1080x1920 sem
 * ficar borrada, o que tornava inutilizável o único material com uma pessoa
 * real a usar o produto (ver `collectReviewMediaInBrowser`).
 */

/** Lado máximo que pedimos. Um vídeo vertical tem 1080 de largura. */
export const LADO_ALVO = 1080;

/**
 * Só mexe no molde `:LARGURA:ALTURA.ext` do CDN. Qualquer outra URL passa
 * intacta — inventar parâmetros em CDN que não conhecemos daria 404, e um 404
 * aqui custa a foto toda.
 */
const MOLDE = /:(\d{2,4}):(\d{2,4})(\.(?:webp|jpeg|jpg|png))/i;

/**
 * @param {unknown} url
 * @param {number} [lado]
 * @returns {unknown} a URL em alta, ou a original se não houver molde a mexer
 */
export function emAltaResolucao(url, lado = LADO_ALVO) {
  if (typeof url !== "string" || url === "") return url;
  const m = url.match(MOLDE);
  if (!m) return url;

  // Nunca REDUZIR: se o CDN já serve maior do que pedimos, fica como está.
  const maiorLadoActual = Math.max(Number(m[1]), Number(m[2]));
  if (maiorLadoActual >= lado) return url;

  return url.replace(MOLDE, `:${lado}:${lado}$3`);
}

/** @param {unknown} lista */
export function listaEmAltaResolucao(lista, lado = LADO_ALVO) {
  if (!Array.isArray(lista)) return lista;
  return lista.map((u) => emAltaResolucao(u, lado));
}
