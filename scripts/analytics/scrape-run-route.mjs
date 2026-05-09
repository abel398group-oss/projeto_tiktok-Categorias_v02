/* eslint-disable no-console -- logs operacionais no terminal da API */
/**
 * POST /scrape/run — uma categoria (`src/scrapeCategory.mjs` + `CATEGORY_URL`).
 * POST /scrape/run-both — as duas categorias fixas do repo (`scripts/scrape-both.mjs`) + consolidação
 * (`scripts/consolidate-category-outputs.mjs`) para `output/dados_*.json`.
 * Um pedido de cada vez entre ambos (409 se ocupado).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const scrapeScript = path.join(repoRoot, "src", "scrapeCategory.mjs");
const scrapeBothScript = path.join(repoRoot, "scripts", "scrape-both.mjs");
const consolidateScript = path.join(repoRoot, "scripts", "consolidate-category-outputs.mjs");

const MAX_URL_LEN = 4096;
const TAIL_MAX = 4000;

/**
 * Pasta de saída por categoria (alinhada a `scripts/scrape-both.mjs` + `consolidate-category-outputs.mjs`).
 * Sem isto, `OUTPUT_DIR=output` sobrescreve `dados_produtos.json` com **uma** categoria e o import “puxa” só essa.
 * @param {string} categoryUrl
 * @returns {{ outputDirAbs: string, underCategorias: boolean }}
 */
function resolveCategoryOutputDir(categoryUrl) {
  let u;
  try {
    u = new URL(categoryUrl.trim());
  } catch {
    return { outputDirAbs: path.join(repoRoot, "output"), underCategorias: false };
  }
  const pl = u.pathname.toLowerCase();
  /** @type {string | null} */
  let sub = null;
  if (pl.includes("/c/womenswear-underwear/")) {
    sub = "womenswear-underwear";
  } else if (pl.includes("/c/women-s-underwear/") || pl.includes("/c/womens-underwear/")) {
    sub = "roupas-intimas-femininas";
  } else {
    const m = u.pathname.match(/\/c\/([^/]+)/i);
    if (m) sub = m[1];
  }
  if (sub) {
    const outputDirAbs = path.join(repoRoot, "output", "categorias", sub);
    return { outputDirAbs, underCategorias: true };
  }
  return { outputDirAbs: path.join(repoRoot, "output"), underCategorias: false };
}

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
 * @param {string} scriptAbs
 * @returns {Promise<{ exitCode: number, stdoutTail: string, stderrTail: string }>}
 */
/**
 * @param {string} label
 * @param {string} scriptAbs
 */
async function runNodeScript(label, scriptAbs) {
  const rel = path.relative(repoRoot, scriptAbs);
  const t0 = Date.now();
  console.log("[scrape] Início %s → node %s", label, rel);
  const child = spawn(process.execPath, [scriptAbs], {
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
  console.log("[scrape] Fim %s exitCode=%s em %sms", label, exitCode, ms);
  if (exitCode !== 0 && (stderrTail || stdoutTail)) {
    const tail = (stderrTail || stdoutTail).slice(-800);
    console.error("[scrape] %s stderr/stdout (últimos 800 chars):\n%s", label, tail);
  }
  return { exitCode, stdoutTail, stderrTail };
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerScrapeRunRoute(fastify) {
  fastify.post("/scrape/run-both", async (_req, reply) => {
    console.log("[scrape] POST /scrape/run-both");
    if (scrapeBusy) {
      console.warn("[scrape] 409 busy — já há scrape/import em curso");
      return reply.code(409).send({
        ok: false,
        error: "busy",
        message: "Já existe um scrape a correr neste processo da API. Aguarde o fim ou use o terminal."
      });
    }

    scrapeBusy = true;
    try {
      const r1 = await runNodeScript("scrape-both", scrapeBothScript);
      if (r1.exitCode !== 0) {
        return reply.code(500).send({
          ok: false,
          error: "scrape_both_failed",
          exitCode: r1.exitCode,
          message: `scrape-both terminou com código ${r1.exitCode}.`,
          stderrTail: r1.stderrTail,
          stdoutTail: r1.stdoutTail
        });
      }

      const r2 = await runNodeScript("consolidate", consolidateScript);
      if (r2.exitCode !== 0) {
        return reply.code(500).send({
          ok: false,
          error: "consolidate_failed",
          exitCode: r2.exitCode,
          message: `consolidate-category-outputs terminou com código ${r2.exitCode}.`,
          stderrTail: r2.stderrTail,
          stdoutTail: r2.stdoutTail
        });
      }

      console.log("[scrape] POST /scrape/run-both concluído com sucesso (scrape-both + consolidate)");
      const outputDirRel = path.relative(repoRoot, path.join(repoRoot, "output")).split(path.sep).join("/");
      return reply.send({
        ok: true,
        exitCode: 0,
        message:
          "Duas categorias colectadas e consolidadas em output/dados_*.json. Para actualizar a base: npm run db:import:output (ou fluxo equivalente).",
        outputDir: outputDirRel,
        consolidated: true
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[scrape] POST /scrape/run-both erro:", msg);
      return reply.code(500).send({ ok: false, error: "spawn_failed", message: msg });
    } finally {
      scrapeBusy = false;
      console.log("[scrape] mutex scrapeBusy=false (run-both)");
    }
  });

  fastify.post("/scrape/run", async (req, reply) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const categoryUrl =
      typeof /** @type {Record<string, unknown>} */ (body).categoryUrl === "string"
        ? /** @type {Record<string, unknown>} */ (body).categoryUrl.trim()
        : "";

    const urlLog =
      categoryUrl.length > 120 ? `${categoryUrl.slice(0, 117)}… (${categoryUrl.length} chars)` : categoryUrl;
    console.log("[scrape] POST /scrape/run categoryUrl=%s", urlLog || "(vazio)");

    if (!isAllowedCategoryUrl(categoryUrl)) {
      console.warn("[scrape] 400 categoryUrl inválida");
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message:
          "categoryUrl tem de ser uma string https:// válida com hostname shop.tiktok.com (máx. 4096 caracteres)."
      });
    }

    if (scrapeBusy) {
      console.warn("[scrape] 409 busy — já há scrape em curso");
      return reply.code(409).send({
        ok: false,
        error: "busy",
        message: "Já existe um scrape a correr neste processo da API. Aguarde o fim ou use o terminal."
      });
    }

    scrapeBusy = true;
    const t0 = Date.now();
    const { outputDirAbs, underCategorias } = resolveCategoryOutputDir(categoryUrl);
    console.log(
      "[scrape] OUTPUT_DIR=%s (%s)",
      path.relative(repoRoot, outputDirAbs),
      underCategorias ? "subpasta categorias → depois consolidate" : "raiz output (sem consolidate)"
    );
    try {
      console.log("[scrape] Início scrapeCategory.mjs (CATEGORY_URL + OUTPUT_DIR)");
      const child = spawn(process.execPath, [scrapeScript], {
        cwd: repoRoot,
        env: { ...process.env, CATEGORY_URL: categoryUrl, OUTPUT_DIR: outputDirAbs },
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
      console.log("[scrape] Fim scrapeCategory exitCode=%s em %sms", exitCode, ms);

      if (exitCode !== 0) {
        const tail = (stderrTail || stdoutTail).slice(-800);
        if (tail) console.error("[scrape] scrapeCategory tail:\n%s", tail);
        return reply.code(500).send({
          ok: false,
          error: "scrape_failed",
          exitCode,
          message: `O scraper terminou com código ${exitCode}.`,
          stderrTail,
          stdoutTail
        });
      }

      let consolidateNote = "";
      if (underCategorias) {
        const r2 = await runNodeScript("consolidate", consolidateScript);
        if (r2.exitCode !== 0) {
          return reply.code(500).send({
            ok: false,
            error: "consolidate_failed",
            exitCode: r2.exitCode,
            message: `Coleta OK, mas consolidate terminou com código ${r2.exitCode}.`,
            stderrTail: r2.stderrTail,
            stdoutTail: r2.stdoutTail
          });
        }
        consolidateNote = " Ficheiros em output/categorias/… consolidados em output/dados_*.json.";
        console.log("[scrape] consolidate após scrape de cartão: OK");
      }

      console.log("[scrape] POST /scrape/run concluído com sucesso");
      const outputDirRel = path.relative(repoRoot, outputDirAbs).split(path.sep).join("/");
      return reply.send({
        ok: true,
        exitCode: 0,
        message: `Coleta concluída.${consolidateNote} Para actualizar a base: npm run db:import:output (ou fluxo equivalente).`,
        outputDir: outputDirRel,
        consolidated: underCategorias,
        stderrTail,
        stdoutTail
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[scrape] POST /scrape/run erro:", msg);
      return reply.code(500).send({ ok: false, error: "spawn_failed", message: msg });
    } finally {
      scrapeBusy = false;
      console.log("[scrape] mutex scrapeBusy=false (run)");
    }
  });
}
