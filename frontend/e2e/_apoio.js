/**
 * Apoio partilhado pelas suítes E2E.
 *
 * Duas decisões que valem por todas as suítes:
 *
 * 1. Erro de consola é falha, com uma lista curta de exceções conhecidas.
 *    Ignorar tudo torna a suíte decorativa; não ignorar nada torna-a instável
 *    por causa de ruído de terceiros (favicon, extensões).
 *
 * 2. Estado local é sempre limpo antes de cada teste. A shortlist e as notas
 *    vivem em localStorage; sem limpeza, um teste que grava contamina o
 *    seguinte e a suíte passa a depender da ordem.
 */

export const CHAVE_SHORTLIST = "tiktok-analytics-creator-shortlist";
export const PREFIXO_CHAVES_APP = "tiktok-analytics";

/** Rótulo dos dados criados pelos testes, para os poder apagar sem dúvidas. */
export const marcaE2E = () => `E2E-AUTO-${Date.now()}`;

/**
 * Ruído que não indica defeito da aplicação.
 *
 * `_stcore` é do Streamlit (outro serviço); ERR_CONNECTION/Failed to fetch
 * aparecem de propósito nas suítes que cortam a rede.
 */
const RUIDO_CONHECIDO = [
  /favicon/i,
  /_stcore/i,
  /ERR_INTERNET_DISCONNECTED/i,
  /ERR_CONNECTION_REFUSED/i,
  /ERR_NETWORK_CHANGED/i,
  /net::ERR_ABORTED/i,
  /Failed to load resource/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /AbortError/i
];

/**
 * Recolhe erros de consola e crashes de página.
 * @param {import("@playwright/test").Page} page
 */
export function vigiarErros(page) {
  /** @type {string[]} */
  const erros = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const texto = msg.text();
    if (RUIDO_CONHECIDO.some((r) => r.test(texto))) return;
    erros.push(texto);
  });
  page.on("pageerror", (e) => {
    const texto = String(e?.message ?? e);
    if (RUIDO_CONHECIDO.some((r) => r.test(texto))) return;
    erros.push(`pageerror: ${texto}`);
  });
  return erros;
}

/**
 * Limpa o estado local da app antes do teste.
 * Tem de correr com uma página já aberta na origem (localStorage é por origem).
 * @param {import("@playwright/test").Page} page
 */
export async function limparEstadoLocal(page) {
  await page.evaluate((prefixo) => {
    const remover = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefixo)) remover.push(k);
    }
    for (const k of remover) localStorage.removeItem(k);
  }, PREFIXO_CHAVES_APP);
}

/**
 * A app não renderiza em branco?
 *
 * Verifica que o `#root` tem conteúdo de verdade — uma página que "carrega"
 * mas monta um React vazio passaria num simples `expect(response).toBeOK()`.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function temConteudoRenderizado(page) {
  return page.evaluate(() => {
    const raiz = document.querySelector("#root");
    if (!raiz) return { ok: false, motivo: "sem #root" };
    const texto = (raiz.textContent ?? "").trim();
    if (texto.length < 10) return { ok: false, motivo: `#root quase vazio (${texto.length} chars)` };
    return { ok: true, motivo: "", chars: texto.length };
  });
}

/** A API de analytics está de pé? Suítes com dados reais dependem disto. */
export async function apiViva(request, baseApi = "http://127.0.0.1:3333") {
  try {
    const r = await request.get(`${baseApi}/health`, { timeout: 4000 });
    return r.ok();
  } catch {
    return false;
  }
}

/**
 * Desliga animações e transições.
 * Snapshot tirado a meio de uma transição falha de forma aleatória.
 * @param {import("@playwright/test").Page} page
 */
export async function congelarAnimacoes(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`
  });
}

/**
 * Rotas reais da aplicação.
 *
 * Mantida à mão de propósito e cruzada com o App.jsx pelo guardião da suíte 01:
 * rota nova sem teste falha a suíte, em vez de passar despercebida.
 */
export const ROTAS = [
  { caminho: "/", nome: "Categorias", esperaTexto: /Categorias|categoria/i },
  { caminho: "/ranking", nome: "Ranking", esperaTexto: /Ranking/i },
  { caminho: "/buscar", nome: "Buscar", esperaTexto: /Buscar/i },
  { caminho: "/estatisticas", nome: "Estatísticas", esperaTexto: /Estatísticas/i },
  { caminho: "/lojas", nome: "Lojas", esperaTexto: /Lojas/i },
  { caminho: "/parametros", nome: "Parâmetros", esperaTexto: /Parâmetros/i },
  { caminho: "/analytics", nome: "Analytics global", esperaTexto: /.+/ },
  { caminho: "/a-mao", nome: "A mão", esperaTexto: /.+/ },
  { caminho: "/shortlist", nome: "Shortlist", esperaTexto: /shortlist/i },
  { caminho: "/categorias", nome: "Categorias (redirect)", esperaTexto: /.+/, redirecionaPara: "/" }
];
