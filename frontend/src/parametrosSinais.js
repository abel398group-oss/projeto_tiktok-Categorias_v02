/**
 * Cortes dos sinais do ranking — ajustáveis pela tela de Parâmetros.
 *
 * Modelo do product-seeker: todo corte com valor, unidade, explicação e FONTE
 * anotada, editável sem deploy. Aqui a edição fica no navegador (localStorage):
 * o painel não tem utilizadores nem sessão, então "configuração por navegador"
 * é o nome honesto do que isto é — e evita inventar tabela no banco para uma
 * preferência de interface.
 */

export const CHAVE_PARAMETROS = "tiktok-analytics-parametros-sinais";
export const PARAMETROS_MUDARAM_EVENT = "tiktok-analytics-parametros-mudaram";

/**
 * Catálogo dos parâmetros: valor padrão + porquê do número.
 * A tela de Parâmetros renderiza ISTO — acrescentar um corte aqui é o
 * suficiente para ele aparecer editável.
 */
export const CATALOGO_PARAMETROS = [
  {
    chave: "ascensao_min_por_dia",
    rotulo: "«Em ascensão» — mínimo de vendas/dia",
    padrao: 10,
    min: 1,
    max: 1000,
    unidade: "vendas/dia",
    fonte:
      "Escolhido observando a base de 08/2026: abaixo de 10/dia o ritmo confunde-se com " +
      "flutuação; acima, é tração real."
  },
  {
    chave: "demanda_min_vendas",
    rotulo: "«Demanda provada» — mínimo de vendas acumuladas",
    padrao: 1000,
    min: 10,
    max: 1000000,
    unidade: "vendas",
    fonte: "1.000 vendas = o mercado já validou o produto; não é mais aposta."
  },
  {
    chave: "disputado_min_vendas",
    rotulo: "«Muito disputado» — vendas acumuladas",
    padrao: 20000,
    min: 1000,
    max: 10000000,
    unidade: "vendas",
    fonte:
      "20 mil+ vendas costuma significar muitos criadores já a promover — o vídeo precisa " +
      "de um ângulo próprio para furar."
  },
  {
    chave: "nota_fraca_max",
    rotulo: "«Nota fraca» — nota abaixo de",
    padrao: 4.3,
    min: 1,
    max: 5,
    passo: 0.1,
    unidade: "estrelas",
    fonte:
      "Abaixo de 4.3 a taxa de devolução/reclamação sobe — e respinga no perfil de quem " +
      "promove o produto."
  }
];

/** Valores padrão como objeto { chave: valor }. */
export function padroes() {
  return Object.fromEntries(CATALOGO_PARAMETROS.map((p) => [p.chave, p.padrao]));
}

/**
 * Valores em vigor: padrão + ajustes guardados neste navegador.
 * Valor fora da faixa (ou lixo) cai no padrão — parâmetro corrompido não pode
 * partir o ranking.
 */
export function getParametrosSinais() {
  const base = padroes();
  try {
    const raw = localStorage.getItem(CHAVE_PARAMETROS);
    if (!raw) return base;
    const guardado = JSON.parse(raw);
    for (const p of CATALOGO_PARAMETROS) {
      const v = Number(guardado?.[p.chave]);
      if (Number.isFinite(v) && v >= p.min && v <= p.max) base[p.chave] = v;
    }
  } catch {
    /* localStorage corrompido → padrões */
  }
  return base;
}

/** Guarda ajustes e avisa as telas abertas (mesmo separador). */
export function setParametrosSinais(valores) {
  try {
    localStorage.setItem(CHAVE_PARAMETROS, JSON.stringify(valores));
    window.dispatchEvent(new Event(PARAMETROS_MUDARAM_EVENT));
  } catch {
    /* sem localStorage não há persistência — a sessão atual ainda funciona */
  }
}

/** Volta tudo ao padrão. */
export function restaurarPadroes() {
  try {
    localStorage.removeItem(CHAVE_PARAMETROS);
    window.dispatchEvent(new Event(PARAMETROS_MUDARAM_EVENT));
  } catch {
    /* idem */
  }
}
