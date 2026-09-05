/**
 * O que trava este produto, e o que o destravaria.
 *
 * ┌─ A DECISÃO DE MODELAGEM QUE ISTO COPIA (product-seeker) ─────────────
 * │ O tipo `status_item` deles tem ALVO, CONDICIONAL e FORA. Não tem
 * │ REPROVADO, e o motivo está escrito:
 * │
 * │   "«reprovado» nunca foi veredito sobre o item — é veredito sobre o
 * │    par (item, nossa estrutura de hoje). Se alguém vende, há retorno;
 * │    o que falta é a nossa estrutura, e estrutura muda."
 * │
 * │ Por isso cada item guarda qual restrição morde PRIMEIRO e o que a
 * │ destrava. O retorno deles foi imediato: uma consulta agrupada mostrou
 * │ 9 itens travados pela MESMA restrição — quase metade do backlog
 * │ destravava com um movimento só.
 * └──────────────────────────────────────────────────────────────────────
 *
 * ┌─ PORQUE ISTO NÃO É O `faltando` QUE JÁ TEMOS ────────────────────────
 * │ São irmãos e respondem a perguntas diferentes:
 * │
 * │   faltando   → o que impede MEDIR   ("não sei a nota deste produto")
 * │   restrição  → o que impede APROVAR ("sei a nota, e ela é fraca")
 * │
 * │ Um score de 62 hoje não diz o que fazer a seguir. Dizer «trava em
 * │ nota_fraca, destrava com 5 avaliações» transforma uma lista ordenada
 * │ numa fila de trabalho — e agrupável: «31 produtos travam por falta de
 * │ galeria» é uma tarefa, não trinta e uma.
 * └──────────────────────────────────────────────────────────────────────
 *
 * A ordem das restrições É a regra: devolve-se a PRIMEIRA que morde, não
 * todas. Um produto sem galeria e sem vendas medidas trava na galeria,
 * porque é essa que impede o passo seguinte do fluxo (gerar o vídeo).
 * Listar as duas faria o leitor escolher, e escolher é o que este campo
 * existe para evitar.
 */

import { corte } from "./score-parametros.mjs";

/**
 * As restrições, por ordem de mordida.
 *
 * `quando` recebe os factos já apurados e diz se morde. `gatilho` é o que
 * a destrava — escrito como acção de quem lê, não como estado do sistema:
 * «conseguir 5 avaliações» e não «ratingTotal >= 5».
 *
 * @type {Array<{ chave: string, rotulo: string, gatilho: string, quando: (f: Factos) => boolean }>}
 */
const RESTRICOES = [
  {
    chave: "sem_vendas_medidas",
    rotulo: "sem leitura de vendas",
    gatilho: "uma coleta em que o TikTok mostre o contador deste produto",
    // Primeiro de todos: sem isto, nenhum outro juízo tem base. Não é o
    // produto que é mau — é a leitura que não saiu.
    quando: (f) => f.vendas == null
  },
  {
    chave: "sem_galeria",
    rotulo: "sem galeria de fotos",
    gatilho: "enriquecer pela PDP (npm run pdp:enrich)",
    // Trava o passo seguinte do fluxo inteiro: sem fotos não há vídeo.
    quando: (f) => !f.temGaleria
  },
  {
    chave: "nota_fraca",
    rotulo: "nota abaixo do mínimo",
    gatilho: "nada da nossa parte — é o mercado que decide; reavaliar na próxima coleta",
    quando: (f) =>
      f.nota != null && f.avaliacoes != null &&
      f.avaliacoes >= corte("oportunidade_avaliacoes_min") &&
      f.nota < corte("oportunidade_nota_min")
  },
  {
    chave: "amostra_curta",
    rotulo: "avaliações a menos para confiar na nota",
    gatilho: `chegar a ${corte("oportunidade_avaliacoes_min")} avaliações`,
    quando: (f) =>
      f.nota != null && f.avaliacoes != null &&
      f.avaliacoes < corte("oportunidade_avaliacoes_min")
  },
  {
    chave: "giro_baixo",
    rotulo: "vendas abaixo do piso",
    gatilho: `chegar a ${corte("oportunidade_vendas_min")} vendas`,
    quando: (f) => f.vendas != null && f.vendas < corte("oportunidade_vendas_min")
  },
  {
    chave: "sem_preco",
    rotulo: "sem preço legível",
    gatilho: "recoletar — o preço existe na página, a leitura é que falhou",
    quando: (f) => f.preco == null || Number(f.preco) <= 0
  }
];

/**
 * @typedef {object} Factos
 * @property {number | null | undefined} vendas
 * @property {number | null | undefined} nota
 * @property {number | null | undefined} avaliacoes
 * @property {number | null | undefined} preco
 * @property {boolean} temGaleria
 */

/**
 * @param {Factos} factos
 * @returns {{ restricaoLigante: string | null, rotuloRestricao: string | null, gatilho: string | null }}
 */
export function restricaoLigante(factos) {
  for (const r of RESTRICOES) {
    if (r.quando(factos)) {
      return { restricaoLigante: r.chave, rotuloRestricao: r.rotulo, gatilho: r.gatilho };
    }
  }
  return { restricaoLigante: null, rotuloRestricao: null, gatilho: null };
}

/** As chaves possíveis, para o painel poder agrupar sem as inventar. */
export const CHAVES_RESTRICAO = RESTRICOES.map((r) => r.chave);
