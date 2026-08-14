/**
 * Qualidade da colheita, medida antes de qualquer análise.
 *
 * O problema que isto resolve: uma coleta pode correr do princípio ao fim,
 * devolver centenas de produtos e ainda assim estar partida — se o TikTok mexer
 * no layout, a navegação continua a funcionar mas a extração deixa de encontrar
 * os campos. O resultado é um ficheiro cheio de itens sem preço, com `status:
 * "ok"`, que entra na base sem ninguém reparar.
 *
 * É especialmente provável aqui porque o preço é identificado por TAMANHO DE
 * LETRA (28–48 px) e os centavos vêm do span vizinho: um teste A/B de design do
 * outro lado chega para partir tudo, e nada nisso se parece com um erro.
 *
 * A defesa é medir e comparar com o que se sabe ser normal. Hoje, medido sobre
 * 825 itens de 8 categorias, preço/nome/vendas vêm a 100%. Uma queda para 40%
 * não é "categoria estranha", é sinal de que o extractor precisa de manutenção.
 */

/** Campos e o mínimo aceitável de preenchimento (fração de 0 a 1). */
export const CAMPOS_CRITICOS = [
  // Sem nome não há vídeo nem pesquisa possível: é o campo mais básico.
  { campo: "nome", minimo: 0.9, rotulo: "nome" },
  // Preço a zero pode ser legítimo num ou noutro item, nunca na categoria toda.
  { campo: "preco", minimo: 0.5, rotulo: "preço" },
  // Sem link não se abre o produto nem se afilia.
  { campo: "link_produto", minimo: 0.8, rotulo: "link" }
];

/** Campos que ajudam mas cuja ausência não invalida a coleta. */
export const CAMPOS_INFORMATIVOS = ["vendas", "avaliacao_media", "seller_id", "fotos"];

/** Um valor conta como presente? `0` conta; `null`, `""` e `[]` não. */
function presente(valor) {
  if (valor == null) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

/**
 * Fração preenchida de cada campo.
 *
 * @param {Array<Record<string, unknown>>} itens
 * @returns {{ total: number, campos: Record<string, { preenchidos: number, fracao: number }> }}
 */
export function medirCompletude(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  const total = lista.length;
  /** @type {Record<string, { preenchidos: number, fracao: number }>} */
  const campos = {};

  const todos = [...CAMPOS_CRITICOS.map((c) => c.campo), ...CAMPOS_INFORMATIVOS];
  for (const campo of todos) {
    const preenchidos = lista.filter((i) => presente(i?.[campo])).length;
    campos[campo] = {
      preenchidos,
      fracao: total > 0 ? Math.round((preenchidos / total) * 1000) / 1000 : 0
    };
  }

  return { total, campos };
}

/**
 * Algum campo crítico desabou?
 *
 * Devolve `null` quando está tudo bem. Não avalia coletas minúsculas: com 3
 * itens, "1 sem preço" dá 67% e dispararia um alarme que não significa nada.
 *
 * @param {ReturnType<typeof medirCompletude>} completude
 * @param {number} total
 * @returns {{ mensagem: string, campos: string[] } | null}
 */
export function avaliarCompletude(completude, total) {
  const MINIMO_PARA_AVALIAR = 10;
  if (!completude || total < MINIMO_PARA_AVALIAR) return null;

  const abaixo = [];
  for (const { campo, minimo, rotulo } of CAMPOS_CRITICOS) {
    const medido = completude.campos?.[campo];
    if (!medido) continue;
    if (medido.fracao < minimo) {
      abaixo.push(
        `${rotulo}: ${Math.round(medido.fracao * 100)}% preenchido ` +
          `(esperado ≥${Math.round(minimo * 100)}%)`
      );
    }
  }

  if (abaixo.length === 0) return null;

  return {
    campos: abaixo,
    mensagem:
      `Colhi ${total} produtos, mas com campos em falta — ${abaixo.join("; ")}. ` +
      "Isto costuma significar que o TikTok mudou o layout e a extração deixou de " +
      "encontrar os campos, não que os produtos não os tenham. Confirme numa página " +
      "do TikTok antes de confiar nestes dados."
  };
}
