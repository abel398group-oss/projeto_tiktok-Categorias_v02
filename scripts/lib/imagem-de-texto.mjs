/**
 * Esta imagem parece tabela de medidas ou banner de texto?
 *
 * ┌─ POR QUE ISTO AVISA E NÃO EXCLUI ────────────────────────────────────
 * │ A primeira versão excluía automaticamente. Medido em 30/08/2026 com
 * │ imagens reais da base, e o resultado matou a ideia:
 * │
 * │   tabela de medidas do ténis .... 74% quase-branco, saturação 0,086
 * │   foto REAL do Pro3Magnésio ..... 62% quase-branco, saturação 0,088
 * │
 * │ São estatisticamente indistinguíveis. Qualquer corte que apanhe a
 * │ tabela apaga também uma foto de produto legítima — e apagaria em
 * │ silêncio, que é o pior modo de falhar: ninguém descobre que o vídeo
 * │ ficou com três fotos em vez de quatro, nem porquê.
 * │
 * │ Por isso devolve SUSPEITA, não veredito. Quem chama lista as
 * │ suspeitas na ficha para uma pessoa decidir. É a mesma regra do
 * │ verificador de política: avisa, não bloqueia.
 * └──────────────────────────────────────────────────────────────────────
 *
 * O que a suspeita mede: imagem de texto tende a ter muito branco e pouca
 * cor. Foto de produto em fundo de catálogo TAMBÉM — daí o empate. O sinal
 * é fraco por natureza; separar a sério exigiria detecção de linhas ou OCR,
 * e nenhum dos dois paga o custo para escolher 4 fotos.
 */

/** Acima disto a imagem entra na lista de suspeitas da ficha. */
export const LIMIAR_SUSPEITA = 0.6;

/**
 * @param {{ data: Buffer|Uint8Array, largura: number, altura: number, canais: number }} bitmap
 *   Pixels RGB crus, como `sharp().removeAlpha().raw()` devolve.
 * @returns {{ suspeita: number, pctQuaseBranco: number, saturacaoMedia: number, porQue: string }}
 *   `suspeita` de 0 a 1. NUNCA é um veredito de exclusão.
 */
export function suspeitaDeTexto({ data, largura, altura, canais }) {
  if (!data || !largura || !altura || !canais) {
    return { suspeita: 0, pctQuaseBranco: 0, saturacaoMedia: 0, porQue: "sem pixels para analisar" };
  }

  let quaseBranco = 0;
  let somaSaturacao = 0;
  let total = 0;

  for (let i = 0; i + canais - 1 < data.length; i += canais) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min > 235) quaseBranco++;
    somaSaturacao += max === 0 ? 0 : (max - min) / max;
    total++;
  }

  if (total === 0) {
    return { suspeita: 0, pctQuaseBranco: 0, saturacaoMedia: 0, porQue: "imagem vazia" };
  }

  const pctQuaseBranco = quaseBranco / total;
  const saturacaoMedia = somaSaturacao / total;

  /*
   * Dois sinais fracos, combinados. Nenhum é conclusivo sozinho, e juntos
   * também não são — ver o cabeçalho. A escala existe só para ordenar a
   * lista de suspeitas: a mais suspeita primeiro, para quem revê não ter de
   * olhar todas.
   */
  const sinalBranco = Math.max(0, Math.min(1, (pctQuaseBranco - 0.35) / 0.45));
  const sinalCor = Math.max(0, Math.min(1, (0.22 - saturacaoMedia) / 0.18));
  const suspeita = Number((sinalBranco * 0.5 + sinalCor * 0.5).toFixed(2));

  return {
    suspeita,
    pctQuaseBranco: Number(pctQuaseBranco.toFixed(3)),
    saturacaoMedia: Number(saturacaoMedia.toFixed(3)),
    porQue:
      suspeita >= LIMIAR_SUSPEITA
        ? `${Math.round(pctQuaseBranco * 100)}% quase branco e pouca cor — pode ser tabela ou banner. CONFIRME antes de usar.`
        : "cor e área ocupada compatíveis com foto de produto"
  };
}
