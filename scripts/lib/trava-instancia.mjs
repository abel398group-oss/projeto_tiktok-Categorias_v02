/**
 * Trava de instância única, por advisory lock do Postgres.
 *
 * ┌─ POR QUE ISTO EXISTE ────────────────────────────────────────────────
 * │ Nada impedia duas coletas ao mesmo tempo. Medido nesta máquina em
 * │ 30/08/2026: três processos `node --watch` zombie a bater na mesma base
 * │ ao mesmo tempo, e ninguém deu por isso até a API começar a falhar.
 * │
 * │ Duas coletas em paralelo custam caro de três maneiras:
 * │   · dois Chrome contra o TikTok pelo MESMO IP — é assim que se apanha
 * │     captcha, e o disjuntor da corrida A não vê a corrida B;
 * │   · o `[pós]` de uma pisa o consolidado da outra a meio da escrita;
 * │   · o pool do Prisma duplica contra um Postgres em container pequeno.
 * └──────────────────────────────────────────────────────────────────────
 *
 * `pg_try_advisory_lock`, não `pg_advisory_lock`: aqui NÃO se quer esperar
 * na fila. Se já há uma coleta de pé, o certo é recusar e dizer isso, não
 * ficar pendurado em silêncio a parecer que arrancou.
 *
 * O lock é de SESSÃO: morre sozinho quando o processo morre, mesmo por
 * SIGKILL ou `taskkill /F`. Nenhum ficheiro de lock para ficar órfão depois
 * de um crash — que é exactamente o modo de falha de uma trava em disco.
 *
 * A ligação NÃO é libertada de propósito: o lock vive enquanto ela viver.
 */

import { PrismaClient } from "@prisma/client";

/** Chaves distintas por operação: coleta e enriquecimento podem coexistir? Não. */
export const CHAVE_COLETA = 728411;
export const CHAVE_ENRIQUECIMENTO = 728412;

/**
 * Tenta tomar a trava.
 *
 * @param {number} chave
 * @param {{ prisma?: import("@prisma/client").PrismaClient }} [opcoes]
 * @returns {Promise<{ ok: true, soltar: () => Promise<void> } | { ok: false, motivo: string }>}
 */
export async function travar(chave, opcoes = {}) {
  const proprio = !opcoes.prisma;
  const prisma = opcoes.prisma ?? new PrismaClient();

  let pegou;
  try {
    const linhas = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${chave}::bigint) AS pegou`;
    pegou = Boolean(linhas?.[0]?.pegou);
  } catch (e) {
    /*
     * Base fora NÃO é "já há outra instância". Devolver `false` aqui faria o
     * chamador dizer a mensagem errada — e o doctor, que corre logo a seguir,
     * é quem sabe diagnosticar isto. Deixa passar.
     */
    if (proprio) await prisma.$disconnect().catch(() => {});
    return { ok: true, soltar: async () => {}, semBase: true };
  }

  if (!pegou) {
    if (proprio) await prisma.$disconnect().catch(() => {});
    return { ok: false, motivo: "já existe outra instância a correr contra esta base" };
  }

  return {
    ok: true,
    soltar: async () => {
      try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${chave}::bigint)`;
      } catch { /* a sessão a morrer já solta */ }
      if (proprio) await prisma.$disconnect().catch(() => {});
    }
  };
}
