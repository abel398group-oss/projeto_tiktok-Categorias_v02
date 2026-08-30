/**
 * Roteiro da narração do vídeo — funções puras, testadas em
 * `test/roteiro-video.test.mjs`.
 *
 * Vive fora de `send-to-money.mjs` porque aquele ficheiro chama `main()` ao ser
 * importado: sem esta separação, importar para testar dispararia a ponte
 * inteira contra a API.
 */

/**
 * Vendas ditas em voz alta, sempre arredondadas PARA BAIXO.
 *
 * Duas razões para não dizer o número exato: "três mil duzentos e cinquenta"
 * soa a relatório, e o contador sobe — dizer "mais de 3 mil" continua verdade
 * daqui a um mês, dizer "3.250" fica velho no dia seguinte.
 *
 * O passo acompanha a grandeza (100 / 1.000 / 10.000) para não perder metade
 * do número: 420.468 vira "420 mil", não "400 mil".
 *
 * @param {number} vendas
 */
export function arredondarVendasParaBaixo(vendas) {
  const passo = vendas < 1000 ? 100 : vendas < 10_000 ? 1000 : 10_000;
  const n = Math.floor(vendas / passo) * passo;
  return n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR")} mil` : String(n);
}

/**
 * Roteiro da narração — só factos que temos, e só os que envelhecem bem.
 *
 * O gerador dimensiona o vídeo pela duração do ÁUDIO, não pelo número de
 * fotos. A versão anterior tinha uma frase só (~9 s), o que dava ~2 clipes de
 * 5 s: das 6 fotos baixadas, 4 eram convertidas (~2 min cada) e deitadas fora.
 * Com um roteiro de ~20 s entram 4 clipes, e as 4 fotos que baixamos são as 4
 * que aparecem.
 *
 * O QUE NÃO ENTRA, E PORQUÊ:
 *
 * · PREÇO. O vídeo é gerado hoje e publicado depois; preço muda. Um vídeo que
 *   diz "36 reais" quando já são 45 é anúncio enganoso — a mesma família de
 *   problema que a regra "mostrar o produto do link" existe para evitar. O
 *   TikTok Shop mostra o preço actual no cartão, por isso repeti-lo na
 *   narração é risco sem ganho.
 *
 * · QUALQUER AFIRMAÇÃO SOBRE O PRODUTO. Não sabemos se funciona, se é bom,
 *   para quem serve. Inventar isso seria escrever publicidade a partir de uma
 *   linha de base de dados.
 *
 * As vendas são arredondadas PARA BAIXO e ditas como "mais de": o contador só
 * sobe (medido — 0 quedas em 18.005 pares), por isso a frase continua verdade
 * daqui a um mês.
 *
 * @param {Record<string, any>} p
 * @param {number} vendas
 */
export function montarRoteiro(p, vendas) {
  const nome = String(p?.nome ?? "").trim();
  const partes = [nome ? `${nome}.` : ""];

  if (Number.isFinite(vendas) && vendas >= 100) {
    partes.push(`Mais de ${arredondarVendasParaBaixo(vendas)} pessoas já compraram.`);
  }

  const nota = Number(p?.avaliacao_media);
  const totalAval = Number(p?.avaliacoes_total);
  if (Number.isFinite(nota) && nota > 0 && Number.isFinite(totalAval) && totalAval >= 5) {
    partes.push(
      `A avaliação média é ${nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}, com ${totalAval.toLocaleString("pt-BR")} avaliações.`
    );
  }

  partes.push("O link está na loja do perfil, com o preço de hoje.");
  return partes.filter(Boolean).join(" ");
}
