/**
 * POST /scrape/run — corre o scraper existente (`src/scrapeCategory.mjs`) com `CATEGORY_URL`.
 * Um pedido de cada vez (409 se ocupado). Resposta após o processo terminar (sem fila nem streaming).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const scrapeScript = path.join(repoRoot, "src", "scrapeCategory.mjs");

const MAX_URL_LEN = 4096;
const TAIL_MAX = 4000;

/** @param {unknown} u */
function isAllowedCategoryUrl(u) {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!s || s.length > MAX_URL_LEN) return false;
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "shop.tiktok.com") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import("stream").Readable | null} stream
 * @returns {Promise<string>}
 */
function readStreamTail(stream, max = TAIL_MAX) {
  if (!stream) return Promise.resolve("");
  return new Promise((resolve) => {
    let acc = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      acc += typeof chunk === "string" ? chunk : String(chunk);
      if (acc.length > max) acc = acc.slice(-max);
    });
    stream.on("end", () => resolve(acc));
    stream.on("error", () => resolve(acc));
  });
}

let scrapeBusy = false;

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerScrapeRunRoute(fastify) {
  fastify.post("/scrape/run", async (req, reply) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const categoryUrl =
      typeof /** @type {Record<string, unknown>} */ (body).categoryUrl === "string"
        ? /** @type {Record<string, unknown>} */ (body).categoryUrl.trim()
        : "";

    if (!isAllowedCategoryUrl(categoryUrl)) {
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message:
          "categoryUrl tem de ser uma string https:// válida com hostname shop.tiktok.com (máx. 4096 caracteres)."
      });
    }

    if (scrapeBusy) {
      return reply.code(409).send({
        ok: false,
        error: "busy",
        message: "Já existe um scrape a correr neste processo da API. Aguarde o fim ou use o terminal."
      });
    }

    scrapeBusy = true;
    try {
      const child = spawn(process.execPath, [scrapeScript], {
        cwd: repoRoot,
        env: { ...process.env, CATEGORY_URL: categoryUrl },
        stdio: ["ignore", "pipe", "pipe"]
      });

      const stdoutP = readStreamTail(child.stdout);
      const stderrP = readStreamTail(child.stderr);

      const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code ?? -1));
      });

      const stdoutTail = await stdoutP;
      const stderrTail = await stderrP;

      if (exitCode !== 0) {
        return reply.code(500).send({
          ok: false,
          error: "scrape_failed",
          exitCode,
          message: `O scraper terminou com código ${exitCode}.`,
          stderrTail,
          stdoutTail
        });
      }

      return reply.send({
        ok: true,
        exitCode: 0,
        message:
          "Coleta concluída. Para actualizar a base: npm run db:import:output (ou fluxo equivalente).",
        stderrTail,
        stdoutTail
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ ok: false, error: "spawn_failed", message: msg });
    } finally {
      scrapeBusy = false;
    }
  });
}
