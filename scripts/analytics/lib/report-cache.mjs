/**
 * Cache em memória para os relatórios analytics.
 *
 * PORQUÊ: os relatórios são leitura pura e só mudam quando entra uma coleta nova
 * (ScrapeRun) ou quando alguém esconde um produto. Ainda assim, cada pedido
 * refazia tudo. Medido em 04/09/2026 na base local (1,17 M snapshots):
 * `/analytics/product-score` 24 s, `/analytics/growth` 26 s,
 * `/analytics/scalable-products` 28 s, `/analytics/coverage` 9,6 s para devolver
 * 1 kB. Alternar entre os seis separadores do painel pagava isso a cada clique.
 *
 * DUAS COISAS QUE ESTE FICHEIRO RESOLVE, e que a versão ingénua não resolvia:
 *
 * 1. PEDIDOS SIMULTÂNEOS. Validar uma entrada precisa do id do run, que é
 *    `await`. Duas chamadas ao mesmo relatório passavam ambas por esse `await`
 *    antes de qualquer uma gravar, e ambas calculavam tudo. Acontece a sério: em
 *    dev o React invoca o efeito duas vezes e o painel pedia `product-score`
 *    duas vezes em paralelo, 9 s cada. `emCurso` é lido e escrito de forma
 *    SÍNCRONA, antes de qualquer `await` — é isso que fecha a corrida.
 *
 * 2. COLETA A DECORRER. A chave de validade é o id do run mais recente, para uma
 *    coleta nova invalidar tudo sozinha. Só que uma sessão de importação cria um
 *    run novo de poucos em poucos minutos (medido: 8 imports em paralelo, 98 runs
 *    numa tarde), e invalidação por si só devolvia a interface ao estado lento a
 *    cada import. Por isso o valor obsoleto é SERVIDO na mesma e renovado por
 *    trás: quem está a navegar vê sempre resposta imediata, no máximo uma coleta
 *    atrasada — que para relatórios de tendência não muda decisão nenhuma.
 *    Passados `IDADE_MAXIMA_MS` deixa de se servir obsoleto e espera-se pelo novo.
 *
 * Só memória do processo: reiniciar a API limpa. É de propósito — não vale a
 * pena persistir o que se recalcula.
 */

/**
 * Só se aplica a valores JÁ OBSOLETOS (coleta nova entretanto): acima desta
 * idade deixa de se servir o antigo e espera-se pelo novo.
 *
 * Enquanto o id do run for o mesmo, o valor guardado continua CORRECTO por
 * definição — a resposta não depende de mais nada — e não tem prazo. A primeira
 * versão disto tinha um tecto de idade aplicado a todas as entradas, e o efeito
 * era o painel voltar a ficar lento sempre que ficasse 10 minutos sem uso, sem
 * que nada na base tivesse mudado (`/analytics/growth` media 2,4 s nesse caso).
 */
const IDADE_MAXIMA_OBSOLETO_MS = 30 * 60 * 1000;

/** Quanto tempo se confia no id de run já lido, para não ir à base a cada pedido. */
const TTL_ID_DE_RUN_MS = 3000;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export function criarCacheDeRelatorios(prisma) {
  /** @type {Map<string, { runId: string | null, em: number, promessa: Promise<any> }>} */
  const entradas = new Map();
  /** Pedidos a decorrer agora, por chave — ver ponto 1 do cabeçalho. @type {Map<string, Promise<any>>} */
  const emCurso = new Map();
  /** Chaves com renovação em segundo plano já lançada, para não empilhar. @type {Set<string>} */
  const aRenovar = new Set();
  /** @type {{ em: number, promessa: Promise<string | null> | null }} */
  let runIdVisto = { em: 0, promessa: null };

  function idDoRunMaisRecente() {
    const agora = Date.now();
    if (runIdVisto.promessa && agora - runIdVisto.em < TTL_ID_DE_RUN_MS) {
      return runIdVisto.promessa;
    }
    const promessa = prisma.scrapeRun
      .findFirst({
        where: { productSnapshots: { some: {} } },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      })
      .then((r) => r?.id ?? null)
      .catch(() => null);
    runIdVisto = { em: agora, promessa };
    return promessa;
  }

  /**
   * Recalcula e guarda, sem ninguém à espera. Um erro aqui não pode rebentar o
   * pedido que já foi servido com o valor anterior.
   * @param {string} chave
   * @param {() => Promise<any>} produzir
   * @param {string | null} runId
   */
  function renovarPorTras(chave, produzir, runId) {
    if (aRenovar.has(chave)) return;
    aRenovar.add(chave);
    const promessa = produzir();
    promessa
      .then(() => {
        entradas.set(chave, { runId, em: Date.now(), promessa });
      })
      .catch(() => {
        // Fica o valor antigo: melhor dado de há uns minutos que um ecrã de erro.
      })
      .finally(() => aRenovar.delete(chave));
  }

  /**
   * @template T
   * @param {string} chave identificador do relatório + parâmetros que mudam a resposta
   * @param {() => Promise<T>} produzir
   * @returns {Promise<T>}
   */
  function comCache(chave, produzir) {
    // Síncrono de propósito: ver ponto 1 do cabeçalho. Nada de `await` antes disto.
    const jaAPedir = emCurso.get(chave);
    if (jaAPedir) return jaAPedir;

    const promessa = resolver(chave, produzir);
    emCurso.set(chave, promessa);
    promessa
      .catch(() => {})
      .then(() => {
        if (emCurso.get(chave) === promessa) emCurso.delete(chave);
      });
    return promessa;
  }

  /**
   * @template T
   * @param {string} chave
   * @param {() => Promise<T>} produzir
   * @returns {Promise<T>}
   */
  async function resolver(chave, produzir) {
    const runId = await idDoRunMaisRecente();
    const guardado = entradas.get(chave);

    if (guardado) {
      // Mesma coleta: a resposta não pode ter mudado. Serve-se, sem prazo.
      if (guardado.runId === runId) {
        return guardado.promessa;
      }
      // Coleta nova: serve-se o anterior e renova-se por trás, desde que não
      // esteja velho ao ponto de enganar quem o lê.
      if (Date.now() - guardado.em < IDADE_MAXIMA_OBSOLETO_MS) {
        renovarPorTras(chave, produzir, runId);
        return guardado.promessa;
      }
    }

    const promessa = produzir().catch((e) => {
      // Um erro não se guarda — senão o painel ficava preso na falha.
      if (entradas.get(chave)?.promessa === promessa) entradas.delete(chave);
      throw e;
    });
    entradas.set(chave, { runId, em: Date.now(), promessa });
    return promessa;
  }

  /** Para mudanças que não criam ScrapeRun (esconder/mostrar produto). */
  function invalidar() {
    entradas.clear();
    emCurso.clear();
    aRenovar.clear();
    runIdVisto = { em: 0, promessa: null };
  }

  return { comCache, invalidar };
}
