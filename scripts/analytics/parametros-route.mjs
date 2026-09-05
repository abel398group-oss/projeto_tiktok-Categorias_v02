/**
 * `GET/PUT /analytics/parametros` — os cortes do score, editáveis sem deploy.
 *
 * ┌─ PORQUE ISTO NÃO É O QUE JÁ HAVIA ───────────────────────────────────
 * │ A tela de Parâmetros já existia e já editava cortes — mas os do
 * │ RANKING, guardados no `localStorage` de quem os mexe. Isso é honesto
 * │ para preferência de leitura.
 * │
 * │ Estes são outra coisa: decidem o que a API devolve a toda a gente,
 * │ incluindo ao MoneyPrinter, que não tem navegador nenhum. Um valor que
 * │ muda o que o robô gera não pode viver no localStorage de um browser.
 * └──────────────────────────────────────────────────────────────────────
 *
 * O catálogo (padrão, unidade, descrição, fonte) vive no CÓDIGO
 * (`lib/score-parametros.mjs`), versionado. A tabela guarda só o que alguém
 * mudou. Apagar uma linha volta ao padrão, e uma base vazia comporta-se
 * exactamente como antes de isto existir.
 */
import { aplicarValores, valoresEmVigor, CORTES } from "./lib/score-parametros.mjs";

/**
 * Lê a tabela e põe os valores em vigor no processo.
 *
 * Chamado no arranque e depois de cada gravação. Falhar aqui NÃO pode
 * impedir a API de subir: sem parâmetros gravados o score usa os padrões,
 * que é o comportamento de sempre — melhor servir com os padrões do que não
 * servir.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function carregarParametros(prisma) {
  try {
    const linhas = await prisma.parametro.findMany({ select: { chave: true, valor: true } });
    const n = aplicarValores(Object.fromEntries(linhas.map((l) => [l.chave, l.valor])));
    if (n > 0) console.log(`[parametros] ${n} corte(s) ajustado(s) em vigor (o resto no padrão).`);
    return n;
  } catch (e) {
    console.warn(`[parametros] não consegui ler a tabela (${e?.message ?? e}) — a usar os padrões.`);
    aplicarValores({});
    return 0;
  }
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ invalidar: () => void }} relatorios
 */
export function registerParametrosRoute(fastify, prisma, relatorios) {
  fastify.get("/analytics/parametros", async () => ({
    cortes: valoresEmVigor()
  }));

  fastify.put("/analytics/parametros", async (req, reply) => {
    const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const valores = corpo.valores && typeof corpo.valores === "object" ? corpo.valores : corpo;

    /* Validar TUDO antes de gravar QUALQUER COISA. Uma gravação parcial
       deixaria o score com metade dos cortes novos e metade dos velhos —
       um estado que ninguém pediu e que é difícil de perceber depois. */
    const aGravar = [];
    const erros = [];
    for (const [chave, bruto] of Object.entries(valores)) {
      if (!CORTES[chave]) { erros.push(`corte desconhecido: ${chave}`); continue; }
      const n = Number(bruto);
      if (!Number.isFinite(n)) { erros.push(`${chave}: "${bruto}" não é número`); continue; }
      if (n < 0) { erros.push(`${chave}: negativo (${n})`); continue; }
      aGravar.push({ chave, valor: n });
    }
    if (erros.length > 0) {
      return reply.code(400).send({ ok: false, erros });
    }

    for (const { chave, valor } of aGravar) {
      await prisma.parametro.upsert({
        where: { chave },
        create: { chave, valor },
        update: { valor }
      });
    }

    await carregarParametros(prisma);
    // Os relatórios em cache foram calculados com os cortes ANTIGOS.
    relatorios.invalidar();

    return { ok: true, gravados: aGravar.length, cortes: valoresEmVigor() };
  });

  /** Voltar ao padrão é apagar a linha, não gravar o valor do catálogo:
      assim o padrão continua a poder mudar no código sem deixar cópias
      antigas presas na base. */
  fastify.delete("/analytics/parametros/:chave", async (req, reply) => {
    const chave = String(req.params.chave ?? "").trim();
    if (!CORTES[chave]) return reply.code(404).send({ ok: false, message: `corte desconhecido: ${chave}` });
    await prisma.parametro.deleteMany({ where: { chave } });
    await carregarParametros(prisma);
    relatorios.invalidar();
    return { ok: true, chave, cortes: valoresEmVigor() };
  });
}
