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
export function registerImportOutputRoute(fastify) {
  fastify.post("/analytics/import-output", async (_req, reply) => {
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
          return reply.send({
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
        return reply.send({
          ok: true,
          skipped: false,
          message: "Importação concluída (JSON → base de dados).",
          detail: Object.keys(detail).length ? detail : undefined
        });
      }

      const tail =
        combinedLog.length > 3800 ? `…${combinedLog.slice(-3700)}` : combinedLog.trim() || `exit ${exitCode}`;
      console.error("[import-output] Falha exitCode=%s · tail:\n%s", exitCode, tail.slice(0, 1200));
      return reply.code(502).send({
        ok: false,
        message: tail || `Import falhou com código ${exitCode}.`
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[import-output] Excepção:", msg);
      return reply.code(500).send({ ok: false, message: msg });
    }
  });
}
