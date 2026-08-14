/**
 * POST /analytics/pdp-enrich — executa pdp:enrich e depois db:import:output, esperando a conclusão.
 */
/* eslint-disable no-console -- logs operacionais no terminal da API */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

/**
 * @param {unknown} body
 * @returns {string[] | null} null se o corpo for inválido
 */
function normalizeProductIds(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (body).productIds;
  if (!Array.isArray(raw)) {
    return null;
  }
  /** @type {string[]} */
  const out = [];
  for (const x of raw) {
    if (typeof x !== "string") {
      continue;
    }
    const t = x.trim();
    if (!t || !/^\d+$/.test(t)) {
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * Executa um comando npm e aguarda a conclusão.
 * @param {string[]} args - Argumentos para npm (ex: ["run", "pdp:enrich", "--", "--ids=..."])
 * @returns {Promise<{ exitCode: number; log: string }>}
 */
async function runNpmCommand(args) {
  return new Promise((resolve, reject) => {
    let log = "";
    const child = spawn("npm", args, {
      cwd: repoRoot,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stderr?.on("data", (d) => {
      log += typeof d === "string" ? d : d.toString();
    });
    child.stdout?.on("data", (d) => {
      log += typeof d === "string" ? d : d.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal === "SIGKILL" ? 1 : 1;
      resolve({ exitCode, log });
    });
  });
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerPdpEnrichRoute(fastify) {
  fastify.post("/analytics/pdp-enrich", async (req, reply) => {
    const ids = normalizeProductIds(req.body);
    if (ids == null) {
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message: 'Corpo JSON com productIds (array de strings) obrigatório.'
      });
    }
    if (ids.length === 0) {
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message: "Nenhum productId válido (apenas dígitos)."
      });
    }

    const idsArg = ids.join(",");
    console.log("[pdp-enrich] Início: npm run pdp:enrich -- --ids=%s", idsArg);
    const t0 = Date.now();

    try {
      // 1. Executa pdp:enrich
      const { exitCode: pdpExitCode, log: pdpLog } = await runNpmCommand([
        "run",
        "pdp:enrich",
        "--",
        `--ids=${idsArg}`
      ]);

      if (pdpExitCode !== 0) {
        const tail = pdpLog.length > 3800 ? `…${pdpLog.slice(-3700)}` : pdpLog.trim() || `exit ${pdpExitCode}`;
        console.error("[pdp-enrich] pdp:enrich falhou exitCode=%s · tail:\n%s", pdpExitCode, tail.slice(0, 1200));

        // Código 4 = correu até ao fim mas não enriqueceu nada. É diferente de
        // ter rebentado: o motivo por produto está no log e na coluna
        // enrich_status. Antes isto saía como sucesso e ninguém percebia.
        if (pdpExitCode === 4) {
          const motivos = [...pdpLog.matchAll(/^ {2}• (\S+): (\S+) — (.+)$/gm)]
            .map((m) => ({ productId: m[1], status: m[2], nota: m[3] }));
          const status = motivos[0]?.status ?? "";
          const detalhe =
            status === "captcha"
              ? "A página do produto não abriu — o TikTok pediu verificação de segurança."
              : status === "sem_galeria"
                ? "A página abriu, mas não tinha galeria utilizável para este produto."
                : status === "url_invalida"
                  ? "Este produto não tem link de PDP utilizável."
                  : "";
          return reply.code(502).send({
            ok: false,
            enriched: 0,
            motivos,
            message:
              `Nenhum produto foi enriquecido.${detalhe ? " " + detalhe : ""} ` +
              "O estado de cada tentativa ficou gravado na base (enrich_status)."
          });
        }

        return reply.code(502).send({
          ok: false,
          message: `pdp:enrich falhou com código ${pdpExitCode}: ${tail}`
        });
      }
      console.log("[pdp-enrich] pdp:enrich concluído em %sms", Date.now() - t0);

      // 2. Executa db:import:output
      console.log("[pdp-enrich] Início: npm run db:import:output");
      const { exitCode: importExitCode, log: importLog } = await runNpmCommand(["run", "db:import:output"]);

      if (importExitCode !== 0) {
        const tail = importLog.length > 3800 ? `…${importLog.slice(-3700)}` : importLog.trim() || `exit ${importExitCode}`;
        console.error("[pdp-enrich] db:import:output falhou exitCode=%s · tail:\n%s", importExitCode, tail.slice(0, 1200));
        return reply.code(502).send({
          ok: false,
          message: `db:import:output falhou com código ${importExitCode}: ${tail}`
        });
      }
      console.log("[pdp-enrich] db:import:output concluído em %sms total", Date.now() - t0);

      // 3. Verifica se a importação foi ignorada
      const skipped = importLog.includes("Importação ignorada");

      return reply.send({
        ok: true,
        skipped,
        message: skipped
          ? "PDP enriquecido e importação ignorada (mesmo input_hash)"
          : "PDP enriquecido e importado com sucesso",
        productIds: ids
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[pdp-enrich] Excepção:", msg);
      return reply.code(500).send({ ok: false, message: msg });
    }
  });
}
