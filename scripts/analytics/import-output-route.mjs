/**
 * POST /analytics/import-output — corre `npm run db:import:output` à espera da conclusão (sincroniza JSON → Postgres).
 */
/* eslint-disable no-console -- logs operacionais no terminal da API */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

/**
 * Extrai metadados do stdout/stderr do `npm run db:import:output` para o painel e integrações.
 * @param {string} combinedLog
 * @param {{ skipped: boolean }} opts
 * @returns {Record<string, string>}
 */
function parseImportLogDetail(combinedLog, opts) {
  const norm = combinedLog.replace(/\r\n/g, "\n");
  if (opts.skipped) {
    const m = norm.match(/\(ScrapeRun existente:\s*(\S+)\s*\|\s*inputHash:\s*([^)]+)\)/);
    if (m) {
      return { existingScrapeRunId: m[1].trim(), inputHash: m[2].trim() };
    }
    return {};
  }
  const parts = norm.split("--- Resumo importação ---");
  const block = parts.length > 1 ? parts[1] : norm;
  const m = block.match(/scrapeRunId:\s*(\S+)/);
  if (m) return { scrapeRunId: m[1].trim() };
  return {};
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
/**
 * O import em curso, se houver.
 *
 * PORQUE EXISTE: esta rota lançava um `npm run db:import:output` novo a CADA
 * chamada, sem olhar se já havia um a correr. Clicar duas vezes no painel, ou o
 * painel de coleta pedir import a cada categoria terminada, empilhava processos
 * que escrevem ~21 mil snapshots cada um — todos na mesma tabela, ao mesmo tempo.
 *
 * Medido em 04/09/2026: 8 imports abertos entre as 14:56 e as 15:36, cada um com
 * 620–800 s de CPU queimados e NENHUM concluído; só 4 coletas gravadas nessa
 * hora. A máquina ficou a 100% de CPU com 1 GB de 16 GB livres, e um teste de
 * CPU que corre em 0,75 s passou a levar 11,1 s — tudo, incluindo o painel,
 * ficou ~15x mais lento. Empilhar imports não importa mais depressa: importa
 * mais devagar e leva o resto da máquina atrás.
 *
 * Quem chegar durante um import em curso passa a esperar por ESSE, em vez de
 * abrir outro. O resultado é o mesmo — a base fica igualmente sincronizada.
 *
 * @type {Promise<any> | null}
 */
let importEmCurso = null;

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerImportOutputRoute(fastify) {
  fastify.post("/analytics/import-output", async (_req, reply) => {
    if (importEmCurso) {
      console.log("[import-output] Já havia um import a correr — este pedido espera por esse.");
      const resultado = await importEmCurso;
      return reply.code(resultado.status).send(resultado.corpo);
    }

    let terminar;
    importEmCurso = new Promise((r) => { terminar = r; });
    try {
      return await correrImport(reply, terminar);
    } finally {
      importEmCurso = null;
    }
  });
}

/**
 * @param {import("fastify").FastifyReply} reply
 * @param {(v: { status: number, corpo: any }) => void} terminar
 */
async function correrImport(reply, terminar) {
  /** Guarda a resposta para quem ficou à espera deste mesmo import. */
  const responder = (status, corpo) => {
    terminar({ status, corpo });
    return reply.code(status).send(corpo);
  };

  {
    /** @type {string} */
    let combinedLog = "";
    const t0 = Date.now();
    console.log("[import-output] Início: npm run db:import:output (cwd=%s)", repoRoot);

    try {
      const exitCode = await new Promise((resolve, reject) => {
        const child = spawn("npm", ["run", "db:import:output"], {
          cwd: repoRoot,
          shell: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
        child.stderr?.on("data", (d) => {
          combinedLog += typeof d === "string" ? d : d.toString();
        });
        child.stdout?.on("data", (d) => {
          combinedLog += typeof d === "string" ? d : d.toString();
        });
        child.on("error", reject);
        child.on("close", (code, signal) => {
          resolve(typeof code === "number" ? code : signal === "SIGKILL" ? 1 : 1);
        });
      });

      const ms = Date.now() - t0;
      console.log(
        "[import-output] npm terminou exitCode=%s em %sms · log capturado: %s chars",
        exitCode,
        ms,
        combinedLog.length
      );
      const logTail = combinedLog.replace(/\r\n/g, "\n").trimEnd().split("\n").slice(-8).join("\n");
      if (logTail) {
        console.log("[import-output] Últimas linhas do npm/import:\n%s", logTail.slice(-1200));
      }

      if (exitCode === 0) {
        const skipped = combinedLog.includes("Importação ignorada");
        const detail = parseImportLogDetail(combinedLog, { skipped });
        if (skipped) {
          console.log("[import-output] Resultado: SKIPPED (mesmo input_hash — BD inalterada)");
          if (detail.existingScrapeRunId) {
            console.log(
              "[import-output] Detalhe: ScrapeRun existente=%s inputHash=%s…",
              detail.existingScrapeRunId,
              (detail.inputHash ?? "").slice(0, 16)
            );
          }
          return responder(200, {
            ok: true,
            skipped: true,
            message:
              "Importação ignorada: o conteúdo de output/dados_*.json é idêntico ao último import (mesmo input_hash). A base não foi alterada — por isso as datas dos cartões não mudam.",
            detail: Object.keys(detail).length ? detail : undefined
          });
        }
        console.log("[import-output] Resultado: IMPORT OK (novo run ou dados gravados)");
        if (detail.scrapeRunId) {
          console.log("[import-output] Detalhe: novo scrapeRunId=%s", detail.scrapeRunId);
        }
        return responder(200, {
          ok: true,
          skipped: false,
          message: "Importação concluída (JSON → base de dados).",
          detail: Object.keys(detail).length ? detail : undefined
        });
      }

      const tail =
        combinedLog.length > 3800 ? `…${combinedLog.slice(-3700)}` : combinedLog.trim() || `exit ${exitCode}`;
      console.error("[import-output] Falha exitCode=%s · tail:\n%s", exitCode, tail.slice(0, 1200));
      return responder(502, {
        ok: false,
        message: tail || `Import falhou com código ${exitCode}.`
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[import-output] Excepção:", msg);
      return responder(500, { ok: false, message: msg });
    }
  }
}
