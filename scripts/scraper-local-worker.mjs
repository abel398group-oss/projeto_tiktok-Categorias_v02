/**
 * Worker local: corre `src/scrapeCategory.mjs` no PC (IP residencial) e envia JSON para a API remota.
 *
 * Env: REMOTE_API_URL, ANALYTICS_API_KEY (obrig.); opcional CATEGORY_URL, OUTPUT_DIR, IMPORT_RUN_TYPE,
 *      WORKER_SKIP_SCRAPE=1 (só POST ficheiros já gerados), SCRAPER_MODE (informativo).
 */
import { access, constants, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const scrapeScript = path.join(repoRoot, "src", "scrapeCategory.mjs");

function resolveOutPaths() {
  const raw =
    process.env.OUTPUT_DIR != null && String(process.env.OUTPUT_DIR).trim() !== ""
      ? String(process.env.OUTPUT_DIR).trim()
      : "output";
  const base = path.isAbsolute(raw) ? path.normalize(raw) : path.join(repoRoot, raw.replace(/\\/g, "/"));
  return {
    dadosProdutos: path.join(base, "dados_produtos.json"),
    dadosLojas: path.join(base, "dados_lojas.json")
  };
}

async function fileExists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeRemoteBase(url) {
  const t = String(url ?? "").trim().replace(/\/+$/, "");
  return t;
}

async function runScrape() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scrapeScript], {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`scrapeCategory terminou com exitCode=${code}`));
    });
  });
}

async function postImport(remoteBase, apiKey, payload) {
  const url = `${remoteBase}/scrape/import-remote`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = json?.message || text || `HTTP ${res.status}`;
    throw new Error(`POST import-remote falhou (${res.status}): ${msg}`);
  }
  return json;
}

async function main() {
  const mode = process.env.SCRAPER_MODE?.trim() || "local-worker";
  const remoteBase = normalizeRemoteBase(process.env.REMOTE_API_URL);
  const apiKey = process.env.ANALYTICS_API_KEY?.trim();

  if (!remoteBase) {
    console.error("Defina REMOTE_API_URL (ex.: https://api.teudominio.com ou http://127.0.0.1:3333)");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Defina ANALYTICS_API_KEY (a mesma chave configurada no servidor da API).");
    process.exit(1);
  }

  console.log("[scraper:worker] SCRAPER_MODE=%s REMOTE_API_URL=%s", mode, remoteBase);

  if (process.env.WORKER_SKIP_SCRAPE !== "1") {
    await runScrape();
  } else {
    console.log("[scraper:worker] WORKER_SKIP_SCRAPE=1 — a saltar Puppeteer, só import remoto.");
  }

  const { dadosProdutos, dadosLojas } = resolveOutPaths();
  if (!(await fileExists(dadosProdutos))) {
    console.error("Ficheiro em falta após scrape:", dadosProdutos);
    process.exit(1);
  }

  const produtosText = await readFile(dadosProdutos, "utf8");
  const lojasExists = await fileExists(dadosLojas);
  const lojasText = lojasExists ? await readFile(dadosLojas, "utf8") : null;

  /** Referências a diagnósticos em output/extra (não enviamos binários por JSON). */
  const extraDir = path.join(path.dirname(dadosProdutos), "extra");
  const diagNames = [
    "final_page.png",
    "final_page.html",
    "body_text.txt",
    "browser_env.json",
    "xhr_debug.json",
    "empty_harvest_diagnostic.json"
  ];
  /** @type {Record<string, boolean>} */
  const diagnosticsPresent = {};
  for (const name of diagNames) {
    diagnosticsPresent[name] = await fileExists(path.join(extraDir, name));
  }

  const importRunType = process.env.IMPORT_RUN_TYPE?.trim();
  /** @type {Record<string, unknown>} */
  const payload = {
    dados_produtos_text: produtosText,
    ...(lojasText != null ? { dados_lojas_text: lojasText } : {}),
    raw_payload_extra: {
      worker: "scraper-local-worker",
      scraper_mode: mode,
      output_dir: process.env.OUTPUT_DIR || "output",
      diagnostics_present: diagnosticsPresent,
      ...(importRunType ? { import_run_type_env: importRunType } : {})
    }
  };
  if (importRunType === "quick_scrape" || importRunType === "pdp_enrich" || importRunType === "unknown") {
    payload.import_run_type = importRunType;
  }

  const out = await postImport(remoteBase, apiKey, payload);
  console.log("[scraper:worker] Resposta API:", JSON.stringify(out, null, 2));
}

await main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
