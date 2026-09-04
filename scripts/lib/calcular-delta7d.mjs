/**
 * `delta7d` — quantas vendas o produto ganhou nos últimos ~7 dias.
 *
 * ┌─ POR QUE UMA COLUNA, E NÃO UMA SÉRIE ────────────────────────────────
 * │ Medido em 23/08/2026: `salesCount` é monotónico — desceu 0 vezes em
 * │ 18.005 pares consecutivos. O contador do TikTok é cumulativo.
 * │
 * │ Logo o delta é uma subtração: vendas de agora menos vendas de há 7
 * │ dias. Guardar a série inteira custaria GB para responder exactamente a
 * │ mesma pergunta ("esquentando?"), que é a única que o pacote faz.
 * └──────────────────────────────────────────────────────────────────────
 *
 * NULL não é zero. Sem leitura de 7 dias atrás não sabemos, e "não medimos"
 * é diferente de "não vendeu" — o mesmo princípio de `vendasMedidas` no
 * relatório de oportunidades.
 *
 * A janela é "o snapshot mais antigo dentro dos últimos `dias`+folga". Sem a
 * folga, uma coleta que atrasou um dia deixaria toda a base sem delta.
 */

/**
 * Dias da janela, e a folga que a torna robusta à cadência real da coleta.
 *
 * A folga era 3 e não servia. Medido em 04/09/2026: a coleta corre a cada
 * ~7 dias mas em dias irregulares — havia leituras a 22/08 e 29/08, e a
 * janela de 25 a 28/08 estava vazia. Resultado: **0 de 33.790 produtos com
 * delta**, e nada denunciava, porque `null` é um valor legítimo aqui.
 *
 * Com folga de 7 a janela passa a ser "entre 7 e 14 dias atrás", que apanha
 * a leitura anterior mesmo com a cadência a variar. O preço é o delta poder
 * cobrir períodos diferentes — por isso `calcularDelta` devolve `dias`, o
 * intervalo REAL, e quem ordena normaliza por ele. Comparar um delta de 7
 * dias com um de 13 sem dizer que são diferentes seria pior do que não ter
 * delta nenhum.
 */
export const DIAS = 7;
export const FOLGA_DIAS = 7;

/**
 * O delta de um produto, dado os seus snapshots ordenados do mais recente
 * para o mais antigo.
 *
 * Extraído e puro para poder ser testado: a regra de qual snapshot serve de
 * base é onde um erro passa despercebido — dá sempre um número.
 *
 * @param {Array<{ capturedAt: Date, salesCount: number | null }>} snapshots
 * @param {{ agora?: Date, dias?: number, folgaDias?: number }} [opcoes]
 * @returns {{ delta: number | null, motivo: string, baseEm?: Date }}
 */
export function calcularDelta({ snapshots, agora = new Date(), dias = DIAS, folgaDias = FOLGA_DIAS } = {}) {
  const lista = (snapshots ?? []).filter((s) => Number.isFinite(s?.salesCount));
  if (lista.length === 0) return { delta: null, motivo: "sem leitura de vendas" };

  const atual = lista[0];
  const msDia = 24 * 60 * 60 * 1000;
  const alvo = agora.getTime() - dias * msDia;
  const limite = agora.getTime() - (dias + folgaDias) * msDia;

  /*
   * Queremos a leitura mais próxima dos 7 dias, não a mais antiga que existe:
   * usar a mais antiga transformaria "delta de 7 dias" em "delta desde
   * sempre" para produto com histórico longo, e o número deixaria de
   * significar o que o nome diz.
   */
  const candidatos = lista.filter((s) => {
    const t = new Date(s.capturedAt).getTime();
    return t <= alvo && t >= limite;
  });

  if (candidatos.length === 0) return { delta: null, motivo: "sem leitura na janela de 7 dias" };

  const base = candidatos.reduce((melhor, s) =>
    Math.abs(new Date(s.capturedAt).getTime() - alvo) < Math.abs(new Date(melhor.capturedAt).getTime() - alvo)
      ? s
      : melhor
  );

  const delta = atual.salesCount - base.salesCount;

  /*
   * Delta negativo não devia acontecer (o contador é cumulativo). Se
   * acontecer, é sinal de dado estranho — produto trocado de id, ou
   * correção do vendedor. Devolver o negativo mentiria sobre "esquentando";
   * devolver null diz a verdade: não sabemos.
   */
  if (delta < 0) return { delta: null, motivo: "contador desceu — leitura suspeita" };

  // `dias` já é o parâmetro da janela pedida; isto é o intervalo REAL medido.
  const diasReais = Math.round(((agora.getTime() - new Date(base.capturedAt).getTime()) / msDia) * 10) / 10;
  return { delta, dias: diasReais, motivo: "ok", baseEm: new Date(base.capturedAt) };
}

/**
 * Recalcula o `delta7d` de todos os produtos com leitura recente.
 *
 * Corre no fim do import, onde os snapshots novos acabaram de entrar.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function recalcularDelta7d(prisma, { agora = new Date() } = {}) {
  const msDia = 24 * 60 * 60 * 1000;
  const desde = new Date(agora.getTime() - (DIAS + FOLGA_DIAS + 1) * msDia);

  /*
   * EM LOTES, e não de uma vez.
   *
   * A primeira versão pedia todos os produtos com snapshots recentes numa
   * `findMany` só. Rebentou com «too many bind variables in prepared
   * statement, expected maximum of 32767, received 32768» — o Postgres tem
   * teto de 32.767 parâmetros por consulta, e o join dos snapshots aninhados
   * ultrapassa-o com facilidade nesta base.
   *
   * Pior: no import isto corre dentro de um `try/catch` que não derruba nada.
   * A coluna ficaria sempre por preencher e ninguém daria por isso, porque
   * `null` é um valor legítimo aqui ("sem leitura de 7 dias").
   */
  const LOTE = 500;
  let comDelta = 0;
  let semJanela = 0;
  let avaliados = 0;
  let cursor;

  for (;;) {
    const produtos = await prisma.product.findMany({
      where: { hiddenAt: null, snapshots: { some: { capturedAt: { gte: desde } } } },
      select: {
        id: true,
        snapshots: {
          where: { capturedAt: { gte: desde } },
          orderBy: { capturedAt: "desc" },
          select: { capturedAt: true, salesCount: true }
        }
      },
      orderBy: { id: "asc" },
      take: LOTE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (produtos.length === 0) break;

    for (const p of produtos) {
      const { delta, dias } = calcularDelta({ snapshots: p.snapshots, agora });
      if (delta == null) semJanela++;
      else comDelta++;
      await prisma.product.update({
        where: { id: p.id },
        data: {
          delta7d: delta,
          delta7dDias: delta == null ? null : dias,
          delta7dEm: delta == null ? null : agora
        }
      });
    }

    avaliados += produtos.length;
    cursor = produtos[produtos.length - 1].id;
    if (produtos.length < LOTE) break;
  }

  return { avaliados, comDelta, semJanela };
}
