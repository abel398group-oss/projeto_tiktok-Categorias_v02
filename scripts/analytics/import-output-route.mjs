/**
 * POST /analytics/import-output — corre `npm run db:import:output` à espera da conclusão (sincroniza JSON → Postgres).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerImportOutputRoute(fastify) {
  fastify.post("/analytics/import-output", async (_req, reply) => {
    /** @type {string} */
    let combinedLog = "";

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

      if (exitCode === 0) {
        return reply.send({
          ok: true,
          message: "Importação concluída (JSON → base de dados)."
        });
      }

      const tail =
        combinedLog.length > 3800 ? `…${combinedLog.slice(-3700)}` : combinedLog.trim() || `exit ${exitCode}`;
      return reply.code(502).send({
        ok: false,
        message: tail || `Import falhou com código ${exitCode}.`
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ ok: false, message: msg });
    }
  });
}
