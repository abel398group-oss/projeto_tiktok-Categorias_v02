/**
 * Sequência de navegação humana — o que o ritmo sozinho não disfarça.
 *
 * ┌─ A LIÇÃO, MEDIDA NO PRODUCT-SEEKER (21/08/2026) ─────────────────────
 * │ Lá, o leitor de página nasceu a abrir o Chromium e a fazer `goto()`
 * │ directo numa ficha. O Mercado Livre respondeu com pedido de
 * │ RECONHECIMENTO FACIAL — não foi desafio de ritmo, foi classificação
 * │ como automação. Um navegador que nasce, não passa pela home, não
 * │ busca nada e cai directo num produto não se parece com ninguém.
 * │
 * │   "A lição não é «faça pausas». É que a SEQUÊNCIA importa tanto
 * │    quanto o intervalo: de onde você veio, o que digitou, se rolou a
 * │    página. Um referrer vazio em série é assinatura."
 * └──────────────────────────────────────────────────────────────────────
 *
 * ┌─ O QUE ESTE FICHEIRO ACRESCENTA, E O QUE JÁ EXISTIA ─────────────────
 * │ O `scrapeCategory.mjs` já aquecia no Google (rato + rolagem) e já
 * │ navega a partir da página anterior para o `Referer` sair verdadeiro —
 * │ essa parte foi medida em 29/08 e é melhor do que a do product-seeker,
 * │ que ainda usa a opção `referer` do `goto` (inerte, medido cá).
 * │
 * │ Faltavam três coisas, e são as três que este módulo traz:
 * │
 * │  1. INTERACÇÃO. Aterrar no Google e rolar é uma visita sem gesto
 * │     nenhum. Quem procura DIGITA — e digitação instantânea é o sinal
 * │     mais barato de detectar que existe, por isso vai caractere a
 * │     caractere com atraso variável.
 * │  2. VOLTA ATRÁS. `scrollBy` sempre positivo é monotónico perfeito.
 * │     Gente relê: passa do ponto e volta. ~15% dos passos sobem.
 * │  3. PAUSA LONGA COM ESTRUTURA. Ter 5% de hipótese de pausa longa a
 * │     cada leitura dá um histograma sem forma. Uma pausa a cada ~7
 * │     leituras é o humano que abriu, leu, e voltou — tem período.
 * └──────────────────────────────────────────────────────────────────────
 *
 * As decisões (quantos passos, que direcção, quanto esperar) são funções
 * PURAS e testadas. Os efeitos (mover rato, rolar, escrever) ficam nas
 * funções `async` que recebem a `page` — essas não são testáveis sem um
 * browser, e por isso não decidem nada.
 */

/**
 * Plano de rolagem: quantos passos, cada um com direcção e distância.
 *
 * `voltarAtras` é a fracção de passos que SOBEM. Zero torna a rolagem
 * monotónica — que é o padrão que denuncia.
 *
 * @param {() => number} [rnd] gerador em [0,1); injectável para teste
 * @returns {Array<{ dy: number, esperaMs: number }>}
 */
export function planoDeRolagem(rnd = Math.random) {
  const passos = 3 + Math.floor(rnd() * 4); // 3..6
  const plano = [];
  for (let i = 0; i < passos; i++) {
    const sobe = rnd() < 0.15;
    const distancia = 250 + rnd() * 550;
    plano.push({
      dy: Math.round(sobe ? -distancia : distancia),
      esperaMs: Math.round(700 + rnd() * 1500)
    });
  }
  return plano;
}

/**
 * Atraso entre teclas. Digitação instantânea não existe em gente.
 * @param {() => number} [rnd]
 */
export function atrasoDeTecla(rnd = Math.random) {
  return Math.round(90 + rnd() * 120);
}

/**
 * A leitura número `i` merece pausa longa?
 *
 * O período varia (6 a 9) para o intervalo não ficar ele próprio previsível:
 * uma pausa exactamente a cada 7 é tão assinatura quanto pausa nenhuma.
 *
 * @param {number} i índice da leitura, a começar em 0
 * @param {() => number} [rnd]
 */
export function tocaPausaLonga(i, rnd = Math.random) {
  if (i <= 0) return false;
  const periodo = 6 + Math.floor(rnd() * 4); // 6..9
  return i % periodo === 0;
}

/**
 * Quanto esperar antes da próxima leitura.
 *
 * A base varia ±60% em vez de ser constante: desvio padrão zero denuncia
 * tanto quanto ausência de pausa. E de tempos a tempos cai a pausa longa,
 * que é o humano a ler o que abriu em vez de saltar para o seguinte.
 *
 * @param {number} baseMs
 * @param {number} i
 * @param {() => number} [rnd]
 * @returns {{ ms: number, longa: boolean }}
 */
export function proximoIntervalo(baseMs, i, rnd = Math.random) {
  if (tocaPausaLonga(i, rnd)) {
    return { ms: Math.round(15000 + rnd() * 25000), longa: true };
  }
  return { ms: Math.round(baseMs * 0.4 + rnd() * baseMs * 1.2), longa: false };
}

/**
 * Termo de busca plausível para quem está prestes a abrir aquelas páginas.
 *
 * Buscar "tênis" e a seguir abrir uma bomba d'água é uma sequência que não
 * fecha. Quem chama conhece a amostra — por isso o termo vem de fora, e o
 * fallback é deliberadamente genérico.
 *
 * @param {string[]} termos
 * @param {() => number} [rnd]
 */
export function escolherTermo(termos = [], rnd = Math.random) {
  const limpos = termos
    .map((t) => String(t ?? "").trim())
    .filter((t) => t.length >= 3 && t.length <= 60);
  if (limpos.length === 0) return "ofertas do dia";
  return limpos[Math.floor(rnd() * limpos.length)];
}

/* ─────────────────────────────────────────────────────────────────────
 * Efeitos. Recebem `page` (Puppeteer) e engolem os próprios erros:
 * isto é disfarce, não coleta — falhar aqui não pode derrubar a rodada.
 * ───────────────────────────────────────────────────────────────────── */

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Rola como gente: passos irregulares, com o rato a mexer-se e ~15% de
 * volta para cima. Mover o rato importa porque a página escuta
 * `mousemove` — rolagem sem rato é assinatura de script.
 *
 * @param {import("puppeteer").Page} page
 */
export async function rolarComoGente(page) {
  for (const passo of planoDeRolagem()) {
    await page.mouse
      .move(200 + Math.random() * 800, 200 + Math.random() * 400)
      .catch(() => {});
    await page
      .evaluate((dy) => window.scrollBy(0, dy), passo.dy)
      .catch(() => {});
    await dormir(passo.esperaMs);
  }
}

/**
 * A página em que aterrámos é um muro de anti-automação?
 *
 * MEDIDO CÁ, 05/09/2026, com o nosso próprio stack (puppeteer-extra +
 * StealthPlugin + Chrome instalado): digitar uma busca no Google e dar Enter
 * devolve `google.com/sorry/index` — a página de "tráfego incomum" — em
 * headless E com janela visível. Abrir a home e rolar passa; procurar não.
 *
 * É a mesma lição que o product-seeker mediu no Mercado Livre em 21/08, e a
 * conclusão é igual: o que denuncia não é o ritmo nem o IP, é a assinatura
 * de automação do navegador.
 *
 * Isto existe porque, sem detectar, o aquecimento ficava PIOR do que não
 * existir: sairíamos de uma página de CAPTCHA para o TikTok, e o `Referer`
 * passaria a dizer "venho de um muro" em vez de "venho do Google".
 *
 * @param {string} url
 */
export function pareceMuroDeBot(url) {
  return /\/sorry\/|\/recaptcha\/|unusual_traffic|suspicious-traffic/i.test(String(url ?? ""));
}

/**
 * Digita um termo numa caixa, caractere a caractere, e dá Enter.
 *
 * Devolve `false` quando não encontrou caixa nenhuma — nunca lança. Falha
 * silenciosa em automação de browser é o padrão, não a excepção: quem
 * chama tem de poder dizer no log que a leitura seguinte partiu sem
 * disfarce.
 *
 * @param {import("puppeteer").Page} page
 * @param {string} termo
 * @param {string[]} seletores
 */
export async function digitarBusca(page, termo, seletores) {
  for (const seletor of seletores) {
    const caixa = await page.$(seletor).catch(() => null);
    if (!caixa) continue;

    /*
     * Subir até à caixa antes de olhar se ela está visível.
     *
     * É o gesto certo: quem rolou e depois quer procurar volta ao topo. NÃO
     * é a explicação da falha vista em 05/09/2026 numa coleta real ("não
     * achei a caixa de busca" numa página que a tinha) — medi depois e a
     * home do Google não rola (`scrollY` fica a 0), por isso a caixa nunca
     * saiu do ecrã. A causa continua por saber; ver o diagnóstico abaixo,
     * que existe para a próxima falha trazer a resposta em vez de um
     * palpite.
     */
    await caixa.scrollIntoView().catch(() => {});
    await dormir(400 + Math.random() * 700);

    const visivel = await caixa
      .isIntersectingViewport()
      .catch(() => false);
    if (!visivel) continue;

    await caixa.click().catch(() => {});
    await dormir(300 + Math.random() * 500);
    await caixa.type(termo, { delay: atrasoDeTecla() }).catch(() => {});
    await dormir(500 + Math.random() * 900);
    await page.keyboard.press("Enter").catch(() => {});
    return true;
  }

  /*
   * NENHUM SELECTOR CASOU — e "não achei" não é diagnóstico.
   *
   * Uma coleta real falhou aqui numa página que tinha a caixa, e a única
   * coisa que ficou no log foi o aviso. Sem saber em que página estávamos,
   * nem quais dos selectores existiam no DOM, não há como decidir se o
   * problema é o selector, a página ou o momento. Isto custa uma linha de
   * log e poupa uma tarde de adivinhação.
   */
  try {
    const diag = await page.evaluate((sels) => ({
      url: location.href,
      titulo: document.title,
      existemNoDom: sels.filter((s) => document.querySelector(s)),
      textoInicial: (document.body?.innerText ?? "").slice(0, 120).replace(/\s+/g, " ")
    }), seletores);
    console.warn(
      `[humanizar] caixa de busca não usável. url=${diag.url} · título="${diag.titulo}" · ` +
      `selectores presentes no DOM=[${diag.existemNoDom.join(", ") || "nenhum"}] · ` +
      `texto="${diag.textoInicial}"`
    );
  } catch {
    console.warn("[humanizar] caixa de busca não usável, e a página nem respondeu ao diagnóstico.");
  }
  return false;
}
