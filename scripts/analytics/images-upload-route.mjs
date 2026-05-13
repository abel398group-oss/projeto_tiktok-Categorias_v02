/* eslint-disable no-console -- logs operacionais no terminal da API */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const loadEnvScript = path.join(repoRoot, "scripts", "load-root-env.mjs");
const uploadScript = path.join(repoRoot, "scripts", "images-upload.mjs");
const loadEnvImport = pathToFileURL(loadEnvScript).href;

const TAIL_MAX = 18_000;

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

function isDigitsOnly(s) {
  return typeof s === "string" && /^\d+$/.test(s.trim());
}

function parseStatsFromLog(combined) {
  const norm = String(combined || "").replace(/\r\n/g, "\n");
  const lines = norm.trimEnd().split("\n").slice(-30);
  const statsLine = [...lines].reverse().find((l) => l.includes("[images] Stats:")) || "";
  if (!statsLine) return null;
  const kv = {};
  for (const part of statsLine.split(/\s+/)) {
    const m = part.match(/^([a-zA-Z_]+)=([0-9]+)$/);
    if (m) kv[m[1]] = Number(m[2]);
  }
  return Object.keys(kv).length ? kv : null;
}

let imagesUploadBusy = false;

/**
 * POST /analytics/images-upload
 * Executa `scripts/images-upload.mjs` (upload de imagens já coletadas em `output/dados_produtos.json`).
 * Não executa scraping, não abre browser, não toca Puppeteer.
 *
 * Body opcional:
 * - productId: string (digits) → passa `--product-id`
 * - maxProducts: number > 0 → passa `--max-products`
 * - dryRun: boolean → passa `--dry-run`
 *
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerImagesUploadRoute(fastify) {
  fastify.post("/analytics/images-upload", async (req, reply) => {
    if (imagesUploadBusy) {
      return reply.code(409).send({
        ok: false,
        error: "busy",
        message: "Já existe um upload de imagens em curso neste processo da API. Aguarde o fim."
      });
    }

    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const productIdRaw = body.productId != null ? String(body.productId).trim() : "";
    const maxProductsRaw = body.maxProducts;
    const dryRun = Boolean(body.dryRun);

    const args = [];
    if (productIdRaw) {
      if (!isDigitsOnly(productIdRaw)) {
        return reply.code(400).send({
          ok: false,
          error: "bad_request",
          message: "productId deve conter apenas dígitos."
        });
      }
      args.push("--product-id", productIdRaw);
    }

    if (maxProductsRaw != null && maxProductsRaw !== "") {
      const n = Number(maxProductsRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return reply.code(400).send({
          ok: false,
          error: "bad_request",
          message: "maxProducts deve ser um número > 0."
        });
      }
      args.push("--max-products", String(Math.trunc(n)));
    }

    if (dryRun) {
      args.push("--dry-run");
    }

    imagesUploadBusy = true;
    const t0 = Date.now();
    console.log("[images-upload] POST /analytics/images-upload start", {
      dryRun,
      productId: productIdRaw || null,
      maxProducts: maxProductsRaw ?? null
    });

    try {
      const child = spawn(process.execPath, ["--import", loadEnvImport, uploadScript, ...args], {
        cwd: repoRoot,
        env: { ...process.env },
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
      const ms = Date.now() - t0;

      const combined = `${stdoutTail}\n${stderrTail}`.trim();
      const stats = parseStatsFromLog(combined);

      if (exitCode !== 0) {
        const tail = (stderrTail || stdoutTail || "").slice(-2200);
        console.error("[images-upload] erro exitCode=%s ms=%s tail=%s", exitCode, ms, tail ? "sim" : "não");
        return reply.code(502).send({
          ok: false,
          error: "images_upload_failed",
          exitCode,
          ms,
          message: `Upload de imagens terminou com código ${exitCode}.`,
          stats,
          stdoutTail,
          stderrTail
        });
      }

      console.log("[images-upload] ok exitCode=0 ms=%s", ms);
      return reply.send({
        ok: true,
        exitCode: 0,
        ms,
        message: "Upload de imagens concluído.",
        stats,
        stdoutTail,
        stderrTail
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[images-upload] excepção:", msg);
      return reply.code(500).send({ ok: false, error: "spawn_failed", message: msg });
    } finally {
      imagesUploadBusy = false;
      console.log("[images-upload] mutex imagesUploadBusy=false");
    }
  });
}
