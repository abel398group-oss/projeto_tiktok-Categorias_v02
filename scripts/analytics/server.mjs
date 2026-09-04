/**
 * API HTTP dos mesmos relatórios que os comandos npm run analytics:*.
 * Leitura em GET; um POST exporta produto para DigitalOcean Spaces (ver docs/ANALYTICS-API.md).
 *
 * Env: DATABASE_URL (obrig.), ANALYTICS_API_KEY (obrig.), ANALYTICS_API_PORT / HOST opcionais.
 * POST export: variáveis SPACES_* no servidor (ver .env.example).
 *
 * Headers aceites para a chave: `Authorization: Bearer <chave>` ou `x-api-key: <chave>`
 */
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { getLatestAndPreviousRun, requireDatabaseUrl } from "./_common.mjs";
import { getGrowthReport } from "./lib/growth.mjs";
import { getNewProductsReport } from "./lib/new-products.mjs";
import {
  clampOpportunitiesLimit,
  getOpportunitiesReport,
  parseOpportunityMode
} from "./lib/opportunities.mjs";
import { getProductScoreReport, getProductScoreFull } from "./lib/product-score.mjs";
import { getCategoryStatsReport } from "./lib/category-stats.mjs";
import { getSellersReport } from "./lib/sellers-report.mjs";
import { clampTopProductsLimit, getTopProductsReport } from "./lib/top-products.mjs";
import { getScalableProductsReport } from "./scalable-products.mjs";
import { getCategoryMapReport } from "./category-map.mjs";
import { getProductWorkspaceDetail } from "./lib/product-workspace.mjs";
import { buildImagesZipBuffer } from "./lib/product-images-zip.mjs";
import { tryGenerateCommercialPromptOutputs } from "./lib/commercial-prompt-export.mjs";
import { extractOrderedImageUrls } from "../lib/extract-image-urls.mjs";
import { registerPdpEnrichRoute } from "./pdp-enrich-route.mjs";
import { buscarTudo } from "./lib/global-search.mjs";
import { registerImportOutputRoute } from "./import-output-route.mjs";
import { registerImagesUploadRoute } from "./images-upload-route.mjs";
import { registerScrapeRunRoute } from "./scrape-run-route.mjs";
import { registerScrapeAllRoute } from "./scrape-all-route.mjs";
import { listImportedCategories } from "./lib/categories-catalog.mjs";
import { hideProduct, unhideProduct, hideProductsBatch, listHiddenProducts } from "./lib/product-hide.mjs";
import { listEnrichedProducts } from "./lib/enriched-products.mjs";
import { getCoverageReport } from "./lib/coverage.mjs";
import { criarCacheDeRelatorios } from "./lib/report-cache.mjs";

requireDatabaseUrl();

const apiKey = process.env.ANALYTICS_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "ANALYTICS_API_KEY não definida. Defina no .env (ex.: ANALYTICS_API_KEY=uma-chave-longa)."
  );
  process.exit(1);
}

const port = Number(process.env.ANALYTICS_API_PORT) || 3333;
const host = process.env.ANALYTICS_API_HOST || "127.0.0.1";

/**
 * Trava de exposição: esta API não tem utilizadores, só uma chave única, e
 * expõe a base inteira em GET — incluindo rotas que ESCREVEM (ocultar produto,
 * disparar coleta, importar). Ligada a `0.0.0.0` com a chave de exemplo, é a
 * base do negócio aberta na rede.
 *
 * "Roda só local" era promessa: bastava alguém pôr `ANALYTICS_API_HOST=0.0.0.0`
 * num teste e esquecer. O risco não é a decisão, é o ESQUECIMENTO — e um
 * comentário no topo do ficheiro não impede esquecimento; um processo que se
 * recusa a subir, sim.
 *
 * Sair do localhost continua a ser possível, mas passa a exigir duas coisas de
 * propósito: uma chave forte e dizer explicitamente que é intencional.
 */
const APENAS_LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);
const CHAVE_MINIMA = 24;
if (!APENAS_LOCAL.has(host)) {
  const exposicaoAceite = /^(1|true|sim)$/i.test(String(process.env.ANALYTICS_API_ALLOW_REMOTE ?? "").trim());
  const chaveFraca = apiKey.length < CHAVE_MINIMA;
  if (!exposicaoAceite || chaveFraca) {
    console.error("\n" + "█".repeat(72));
    console.error(`  RECUSANDO SUBIR: a API ficaria acessível em ${host}:${port}.`);
    console.error("");
    if (!exposicaoAceite) {
      console.error("  Esta API não tem utilizadores nem permissões — uma chave só, e rotas");
      console.error("  que escrevem na base. Fora do localhost, isso é a base exposta.");
      console.error("  Se for mesmo intencional: ANALYTICS_API_ALLOW_REMOTE=1");
    }
    if (chaveFraca) {
      console.error(`  ANALYTICS_API_KEY tem ${apiKey.length} caracteres — mínimo ${CHAVE_MINIMA} fora do localhost.`);
    }
    console.error("");
    console.error(`  Para voltar ao normal: ANALYTICS_API_HOST=127.0.0.1 (ou remova a variável).`);
    console.error("█".repeat(72) + "\n");
    process.exit(1);
  }
  console.warn(`[api] ATENÇÃO: a escutar em ${host} — acessível fora desta máquina (ANALYTICS_API_ALLOW_REMOTE=1).`);
}

const prisma = new PrismaClient();
/** Relatórios são leitura pura: a mesma pergunta no mesmo ScrapeRun dá a mesma resposta. */
const relatorios = criarCacheDeRelatorios(prisma);
const fastify = Fastify({ logger: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

function extractBearer(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function keyFromRequest(req) {
  const x =
    req.headers["x-api-key"] != null ? String(req.headers["x-api-key"]).trim() : "";
  return extractBearer(req) ?? (x !== "" ? x : null);
}

fastify.addHook("preHandler", async (req, reply) => {
  const path = req.url.split("?")[0] ?? "";
  if (path === "/health") {
    return;
  }
  const got = keyFromRequest(req);
  if (got !== apiKey) {
    return reply.code(401).send({ error: "unauthorized", message: "Chave ausente ou inválida." });
  }
});

fastify.get("/health", async () => ({
  ok: true,
  service: "analytics-api"
}));

fastify.get("/analytics/top-products", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  const limRaw = req.query?.limit;
  const limit = clampTopProductsLimit(
    typeof limRaw === "string"
      ? limRaw
      : Array.isArray(limRaw) && limRaw.length > 0
        ? limRaw[0]
        : undefined
  );
  return relatorios.comCache(`top|${categoryUrl}|${limit}`, () =>
    getTopProductsReport(prisma, {
      ...(categoryUrl !== "" ? { categoryUrl } : {}),
      limit
    })
  );
});

fastify.get("/analytics/opportunities", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  const limRaw = req.query?.limit;
  const limit = clampOpportunitiesLimit(
    typeof limRaw === "string"
      ? limRaw
      : Array.isArray(limRaw) && limRaw.length > 0
        ? limRaw[0]
        : undefined
  );
  const modeRaw = req.query?.mode;
  const mode = parseOpportunityMode(
    typeof modeRaw === "string"
      ? modeRaw
      : Array.isArray(modeRaw) && modeRaw.length > 0 && typeof modeRaw[0] === "string"
        ? modeRaw[0]
        : ""
  );
  return relatorios.comCache(`opp|${categoryUrl}|${limit}|${mode}`, () =>
    getOpportunitiesReport(prisma, {
      ...(categoryUrl !== "" ? { categoryUrl } : {}),
      limit,
      mode
    })
  );
});


fastify.get("/analytics/product-score", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return relatorios.comCache(`score|${categoryUrl}`, () =>
    getProductScoreReport(prisma, categoryUrl !== "" ? { categoryUrl } : {})
  );
});

fastify.get("/analytics/new-products", async () =>
  relatorios.comCache("new-products", () => getNewProductsReport(prisma))
);

fastify.get("/analytics/growth", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return relatorios.comCache(`growth|${categoryUrl}`, () =>
    getGrowthReport(prisma, categoryUrl !== "" ? { categoryUrl } : {})
  );
});

async function scalableProductsFromQuery(req) {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return relatorios.comCache(`scale|${categoryUrl}`, () =>
    getScalableProductsReport(prisma, categoryUrl !== "" ? { categoryUrl } : {})
  );
}

fastify.get("/analytics/scalable-products", scalableProductsFromQuery);
fastify.get("/analytics/scalable", scalableProductsFromQuery);

fastify.get("/analytics/category-map", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return relatorios.comCache(`map|${categoryUrl}`, () =>
    getCategoryMapReport(prisma, categoryUrl !== "" ? { categoryUrl } : {})
  );
});

fastify.get("/analytics/categories", async () =>
  relatorios.comCache("categories", () => listImportedCategories(prisma))
);

fastify.get("/analytics/sellers", async () =>
  relatorios.comCache("sellers", () => getSellersReport(prisma))
);

fastify.get("/analytics/category-stats", async () =>
  relatorios.comCache("category-stats", () =>
    getCategoryStatsReport(prisma, (p) => getProductScoreFull(p, {}))
  )
);

fastify.get("/analytics/search", async (req) => {
  const raw = req.query?.q;
  const q = typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0] ?? "") : "";
  return buscarTudo(prisma, q);
});

// Media 5,8-9,6 s para devolver 1 KB (medido no painel Ranking em 04/09/2026):
// o custo esta em varrer a coleta inteira, nao no tamanho da resposta.
fastify.get("/analytics/coverage", async () =>
  relatorios.comCache("coverage", () => getCoverageReport(prisma))
);

fastify.get("/analytics/hidden-products", async () =>
  relatorios.comCache("hidden-products", () => listHiddenProducts(prisma))
);

// Candidatos a vídeo: produtos com galeria no banco, de QUALQUER coleta.
// Ver o cabeçalho de lib/enriched-products.mjs para o porquê de não bastar
// `/analytics/top-products`.
fastify.get("/analytics/enriched-products", async (req) => {
  const num = (v) => {
    const bruto = Array.isArray(v) ? v[0] : v;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : undefined;
  };
  const minFotos = num(req.query?.minFotos);
  const limit = num(req.query?.limit);
  return relatorios.comCache(`enriched|${minFotos}|${limit}`, () =>
    listEnrichedProducts(prisma, { minFotos, limit })
  );
});

fastify.post("/analytics/product-hide/:productId", async (req, reply) => {
  const result = await hideProduct(prisma, req.params.productId);
  // Esconder um produto muda as listas sem criar ScrapeRun novo:
  // sem isto, o cache dos relatórios continuaria a mostrá-lo.
  relatorios.invalidar();
  if (!result.ok) {
    return reply.code(result.error === "not_found" ? 404 : 400).send(result);
  }
  return result;
});

fastify.post("/analytics/product-unhide/:productId", async (req, reply) => {
  const result = await unhideProduct(prisma, req.params.productId);
  // Esconder um produto muda as listas sem criar ScrapeRun novo:
  // sem isto, o cache dos relatórios continuaria a mostrá-lo.
  relatorios.invalidar();
  if (!result.ok) {
    return reply.code(result.error === "not_found" ? 404 : 400).send(result);
  }
  return result;
});

fastify.post("/analytics/product-hide-batch", async (req, reply) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const result = await hideProductsBatch(prisma, body.productIds);
  // Esconder um produto muda as listas sem criar ScrapeRun novo:
  // sem isto, o cache dos relatórios continuaria a mostrá-lo.
  relatorios.invalidar();
  if (!result.ok) {
    return reply.code(400).send(result);
  }
  return result;
});

fastify.get("/analytics/product-workspace/:productId", async (req, reply) => {
  const raw = req.params.productId != null ? String(req.params.productId).trim() : "";
  const result = await getProductWorkspaceDetail(prisma, decodeURIComponent(raw));
  if ("error" in result) {
    const { error, message } = result;
    if (error === "bad_request") {
      return reply.code(400).send({ error, message });
    }
    if (error === "not_found" || error === "no_snapshot") {
      return reply.code(404).send({ error, message });
    }
    return reply.code(200).send({ error, message });
  }
  return reply.send(result);
});

/**
 * ZIP com fotos do snapshot (servidor faz fetch CDN — sem CORS no browser).
 * Corpo opcional `{ "urls": ["https://...", ...] }`; se omitir urls → todas pela ordem do workspace.
 */
fastify.post("/analytics/product-workspace/:productId/images-zip", async (req, reply) => {
  const raw = req.params.productId != null ? String(req.params.productId).trim() : "";
  const tiktokId = decodeURIComponent(raw);
  const detail = await getProductWorkspaceDetail(prisma, tiktokId);
  if ("error" in detail) {
    const { error, message } = detail;
    if (error === "bad_request") {
      return reply.code(400).send({ error, message });
    }
    if (error === "not_found" || error === "no_snapshot") {
      return reply.code(404).send({ error, message });
    }
    return reply.code(503).send({ error, message });
  }

  const allowed = Array.isArray(detail.imageUrls) ? detail.imageUrls : [];
  const allowedSet = new Set(allowed);

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const urlsBody = Array.isArray(body.urls) ? body.urls : null;

  /** @type {string[]} */
  let list = [];
  if (urlsBody != null && urlsBody.length > 0) {
    for (const item of urlsBody) {
      if (typeof item !== "string") {
        return reply
          .code(400)
          .send({ error: "bad_request", message: 'Cada entrada em "urls" tem de ser uma string.' });
      }
      const t = item.trim();
      if (!allowedSet.has(t)) {
        return reply.code(400).send({
          error: "invalid_urls",
          message: "Alguma URL não pertence ao snapshot deste produto."
        });
      }
      list.push(t);
    }
  } else {
    list = [...allowed];
  }

  if (list.length === 0) {
    return reply.code(400).send({
      error: "no_images",
      message: "Não há imagens disponíveis para este produto no snapshot actual."
    });
  }

  try {
    const { buffer, downloaded, failedCount } = await buildImagesZipBuffer(list);
    const fnameRaw = `produto-${detail.productId}-fotos.zip`;
    const fname = fnameRaw.replace(/[^a-zA-Z0-9._-]/g, "_");
    return reply
      .code(200)
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${fname}"`)
      .header("X-Zip-Downloaded", String(downloaded))
      .header("X-Zip-Failed", String(failedCount))
      .send(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return reply.code(502).send({ error: "zip_failed", message: msg });
  }
});

function isDigitsOnly(s) {
  return /^[0-9]+$/.test(String(s || "").trim());
}

function safeSlug(s) {
  const raw = typeof s === "string" ? s : "";
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return slug || "produto";
}

function ticketTierFromPrice(price) {
  if (price == null || !Number.isFinite(Number(price))) return null;
  const p = Number(price);
  if (p < 30) return "baixo";
  if (p < 80) return "medio";
  return "alto";
}

function categoryLabelFromUrl(categoryUrl) {
  const raw = typeof categoryUrl === "string" ? categoryUrl.trim() : "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    const cIdx = parts.indexOf("c");
    if (cIdx < 0) return null;
    const slug = parts[cIdx + 1] || "";
    if (!slug) return null;
    const label = slug
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (!label) return null;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return null;
  }
}

function fmtPtPriceBRL(price) {
  if (price == null || !Number.isFinite(Number(price))) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(price));
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function pickImageExt(contentType, url) {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.(webp|jpe?g|png|gif)(?:\?|$)/i);
    if (m) {
      const e = m[1].toLowerCase();
      return e === "jpeg" ? "jpg" : e;
    }
  } catch {
  }
  const c = String(contentType || "").toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("jpeg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("gif")) return "gif";
  return "bin";
}

async function convertImageForAi(buf, contentType, url) {
  const originalExt = pickImageExt(contentType, url);
  const img = sharp(buf, { failOnError: false });
  const meta = await img.metadata();
  const hasAlpha = Boolean(meta?.hasAlpha);
  if (hasAlpha) {
    const out = await img.png({ compressionLevel: 9 }).toBuffer();
    return { buf: out, ext: "png", originalExt };
  }
  const out = await img.jpeg({ quality: 90 }).toBuffer();
  return { buf: out, ext: "jpg", originalExt };
}

async function fetchImageBuffer(url) {
  const ctrl = new AbortController();
  const timeoutMs = 25000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "tiktok-shop-export-local/1.0 (analytics-api)" }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, contentType: res.headers.get("content-type") || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}

async function runNpmScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
      cwd: repoRoot,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let combined = "";
    child.stdout?.on("data", (d) => {
      combined += typeof d === "string" ? d : d.toString();
    });
    child.stderr?.on("data", (d) => {
      combined += typeof d === "string" ? d : d.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 1;
      resolve({ exitCode, log: combined });
    });
  });
}

async function tryGenerateStructuredPromptOutputs({ productId, productDir }) {
  const runner = path.join(repoRoot, "scripts", "structured-prompt-export.ts");
  return new Promise((resolve) => {
    const child = spawn(
      "npm",
      ["exec", "--yes", "--package", "tsx", "--", "tsx", runner, "--dir", productDir],
      { cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    let combined = "";
    child.stdout?.on("data", (d) => {
      combined += typeof d === "string" ? d : d.toString();
    });
    child.stderr?.on("data", (d) => {
      combined += typeof d === "string" ? d : d.toString();
    });
    child.on("error", (e) => {
      resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    });
    child.on("close", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 1;
      if (exitCode === 0) {
        resolve({ success: true });
        return;
      }
      const tail = combined.replace(/\r\n/g, "\n").trimEnd().split("\n").slice(-18).join("\n");
      resolve({ success: false, error: tail || `structured_prompt_failed exitCode=${exitCode}`, productId });
    });
  });
}

async function resolveProductSnapshotForExport(tiktokProductId) {
  const { latest } = await getLatestAndPreviousRun(prisma);
  if (!latest) {
    return { error: "no_run", message: "Sem dados: nenhum ScrapeRun. Importe primeiro (npm run db:import:output)." };
  }
  const product = await prisma.product.findUnique({
    where: { productId: tiktokProductId },
    include: {
      seller: true,
      snapshots: {
        where: { scrapeRunId: latest.id },
        orderBy: { capturedAt: "desc" },
        take: 1
      }
    }
  });
  if (!product) {
    return { error: "not_found", message: `Produto não encontrado: productId=${tiktokProductId}` };
  }
  let snap = product.snapshots[0] ?? null;
  if (!snap) {
    snap = await prisma.productSnapshot.findFirst({
      where: { productRefId: product.id },
      orderBy: [{ scrapeRun: { collectedAt: "desc" } }, { capturedAt: "desc" }]
    });
  }
  if (!snap) {
    return {
      error: "no_snapshot",
      message: "Este produto não tem nenhum snapshot na base (importe dados primeiro)."
    };
  }
  return { product, snap };
}

fastify.post("/analytics/export-local", async (req, reply) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const productIdRaw = body.productId != null ? String(body.productId).trim() : "";
  const selectedImageUrlRaw = body.selectedImageUrl != null ? String(body.selectedImageUrl).trim() : "";
  if (!productIdRaw || !isDigitsOnly(productIdRaw)) {
    return reply.code(400).send({
      ok: false,
      error: "bad_request",
      message: "productId deve conter apenas dígitos."
    });
  }

  // Exporta para a raiz do projeto: exportado/<categoria>/<produto>/ (antes: Documentos/Scraper-TikTok-Produtos).
  const baseDir = path.join(repoRoot, "exportado");

  let current = await resolveProductSnapshotForExport(productIdRaw);
  if ("error" in current) {
    const { error, message } = current;
    if (error === "bad_request") return reply.code(400).send({ ok: false, error, message });
    if (error === "not_found" || error === "no_snapshot") return reply.code(404).send({ ok: false, error, message });
    return reply.code(503).send({ ok: false, error, message });
  }

  const asHttpUrls = (urls) =>
    (Array.isArray(urls) ? urls : [])
      .filter((u) => typeof u === "string")
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http"));

  const descriptionFromSnap = (snap) => {
    const dq = snap?.dataQuality;
    if (!dq || typeof dq !== "object") return null;
    const v = dq.productDescription;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  };

  const descriptionFromOutputJson = async () => {
    try {
      const p = path.join(repoRoot, "output", "dados_produtos.json");
      const raw = await fsp.readFile(p, "utf8");
      const payload = JSON.parse(raw);
      const itens = Array.isArray(payload?.itens) ? payload.itens : [];
      for (const it of itens) {
        const id = it?.product_id != null ? String(it.product_id).trim() : "";
        if (id !== productIdRaw) continue;
        const v = it?.productDescription;
        if (typeof v !== "string") return null;
        const t = v.trim();
        return t ? t : null;
      }
      return null;
    } catch {
      return null;
    }
  };

  const pdpHttpUrlsFrom = (snap) =>
    asHttpUrls(extractOrderedImageUrls({ pdpImages: snap?.pdpImages ?? null }));

  const dedupe = (urls) => {
    const out = [];
    const seen = new Set();
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  };

  let { product, snap } = current;
  let pdpOnly = pdpHttpUrlsFrom(snap);
  const shouldEnrich = pdpOnly.length < 3;

  if (shouldEnrich) {
    const r1 = await runNpmScript("pdp:enrich", [`--ids=${productIdRaw}`]);
    if (r1.exitCode !== 0) {
      const tail = r1.log.replace(/\r\n/g, "\n").trimEnd().split("\n").slice(-12).join("\n");
      return reply.code(502).send({
        ok: false,
        error: "pdp_enrich_failed",
        message: "PDP enrich falhou.",
        logTail: tail
      });
    }
    const r2 = await runNpmScript("db:import:output", []);
    if (r2.exitCode !== 0) {
      const tail = r2.log.replace(/\r\n/g, "\n").trimEnd().split("\n").slice(-12).join("\n");
      return reply.code(502).send({
        ok: false,
        error: "import_failed",
        message: "Import falhou após PDP enrich.",
        logTail: tail
      });
    }
    current = await resolveProductSnapshotForExport(productIdRaw);
    if ("error" in current) {
      return reply.code(503).send({ ok: false, error: current.error, message: current.message });
    }
    product = current.product;
    snap = current.snap;
    pdpOnly = pdpHttpUrlsFrom(snap);
  }

  const allUrls = asHttpUrls(extractOrderedImageUrls(snap));
  const list = dedupe(pdpOnly.length > 0 ? pdpOnly : allUrls);
  if (list.length === 0) {
    return reply.code(409).send({
      ok: false,
      error: "no_images",
      message: "Não há imagens HTTP válidas disponíveis para exportar localmente."
    });
  }

  const selectedImageUrl =
    selectedImageUrlRaw && selectedImageUrlRaw.startsWith("http") ? selectedImageUrlRaw : null;

  await ensureDir(baseDir);

  const nome = typeof product.name === "string" ? product.name.trim() : "";
  const slug = safeSlug(nome);
  // Subpasta por categoria dentro de exportado/ (ex.: exportado/womenswear-underwear/<nome>_<id>/).
  const categoriaSlug = safeSlug(categoryLabelFromUrl(product.categoryUrl) ?? "sem-categoria");
  const productDir = path.join(baseDir, categoriaSlug, `${slug}_${productIdRaw}`);
  const imagesDir = path.join(productDir, "imagens");
  await ensureDir(imagesDir);

  const link = typeof product.productUrl === "string" && product.productUrl.trim() ? product.productUrl.trim() : null;
  const linkOut = link || `https://www.tiktok.com/shop/br/pdp/${encodeURIComponent(productIdRaw)}`;
  let linkMobile = linkOut;
  try {
    const u = new URL(linkOut);
    linkMobile = `tiktok://www.tiktok.com${u.pathname}`;
  } catch {
  }

  const ts = new Date().toISOString();
  const written = [];
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    try {
      const { buf: rawBuf, contentType } = await fetchImageBuffer(url);
      const { buf, ext } = await convertImageForAi(rawBuf, contentType, url);
      const slot = String(i + 1).padStart(3, "0");
      const fname = `imagem-${slot}.${ext}`;
      const outPath = path.join(imagesDir, fname);
      await fsp.writeFile(outPath, buf);
      written.push({ file: fname, url });
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const isAllowedImageExt = (fileName) => {
    const t = typeof fileName === "string" ? fileName.trim().toLowerCase() : "";
    return t.endsWith(".jpg") || t.endsWith(".jpeg") || t.endsWith(".png") || t.endsWith(".webp");
  };
  const urlPathname = (u) => {
    try {
      return new URL(u).pathname || "";
    } catch {
      return "";
    }
  };

  /** @type {{ file: string, url: string } | null} */
  let selectedWritten = null;
  if (selectedImageUrl) {
    selectedWritten =
      written.find((w) => w.url === selectedImageUrl) ??
      written.find((w) => urlPathname(w.url) !== "" && urlPathname(w.url) === urlPathname(selectedImageUrl)) ??
      null;
  }

  const legacyLinkTxtName = `link_${productIdRaw}.txt`;
  const legacyUrlName = `produto_${productIdRaw}.url`;
  const legacyProdutoTxtName = `produto_${productIdRaw}.txt`;
  const legacyDescricaoTxtName = `descricao_${productIdRaw}.txt`;
  const legacyMetaName = `metadata_${productIdRaw}.json`;
  const metaDirName = "metadata";
  const metaName = "metadata.json";

  try {
    await fsp.rm(path.join(productDir, legacyLinkTxtName), { force: true });
    await fsp.rm(path.join(productDir, legacyUrlName), { force: true });
    await fsp.rm(path.join(productDir, legacyProdutoTxtName), { force: true });
    await fsp.rm(path.join(productDir, legacyDescricaoTxtName), { force: true });
    await fsp.rm(path.join(productDir, legacyMetaName), { force: true });
  } catch {
  }

  /** @type {number | null} */
  const price = typeof snap.price === "number" && Number.isFinite(snap.price) ? snap.price : null;
  /** @type {number | null} */
  const rating = typeof snap.ratingAverage === "number" && Number.isFinite(snap.ratingAverage) ? snap.ratingAverage : null;
  /** @type {number | null} */
  const sales = typeof snap.salesCount === "number" && Number.isFinite(snap.salesCount) ? snap.salesCount : null;
  const ticket = ticketTierFromPrice(price);

  /** @type {number | null} */
  let score = null;
  try {
    const ws = await getProductWorkspaceDetail(prisma, productIdRaw);
    if (!("error" in ws)) {
      const n = ws.score;
      if (typeof n === "number" && Number.isFinite(n)) score = n;
    }
  } catch {
    // ignore
  }

  const categoriaUrl = product.categoryUrl ?? null;
  const categoriaLabel = categoryLabelFromUrl(categoriaUrl);
  const productDescription =
    descriptionFromSnap(snap) ?? (await descriptionFromOutputJson());

  const meta = {
    productId: productIdRaw,
    sellerId: product.seller?.sellerId ?? null,
    nome: nome || "—",
    categoria: categoriaUrl,
    link: linkOut,
    links: {
      web: linkOut,
      mobile: linkMobile
    },
    exportedAt: ts,
    timestamps: {
      exportedAt: ts
    },
    product: {
      productId: productIdRaw,
      sellerId: product.seller?.sellerId ?? null,
      nome: nome || "—",
      categoria: categoriaUrl,
      categoriaLabel
    },
    description: productDescription ?? null,
    images: { total: list.length, saved: written.length, failed: failed.length, files: written },
    analytics: {
      price,
      rating,
      sales,
      score,
      ticket
    },
    assets: {
      images: { total: list.length, saved: written.length, failed: failed.length }
    },
    content: {
      description: productDescription,
      hooks: [],
      hashtags: [],
      cta: [],
      ugcIdeas: []
    },
    context: {
      categoriaLabel
    }
  };

  if (selectedWritten && isAllowedImageExt(selectedWritten.file)) {
    try {
      const selectedDir = path.join(imagesDir, "imagem-selecionada");
      await ensureDir(selectedDir);
      const dst = path.join(selectedDir, "imagem-principal.jpg");
      await fsp.copyFile(path.join(imagesDir, selectedWritten.file), dst);
      meta.imagemSelecionada = {
        arquivoOriginal: selectedWritten.file,
        caminhoOriginal: `imagens/${selectedWritten.file}`,
        caminhoSelecionado: "imagens/imagem-selecionada/imagem-principal.jpg",
        selecionadoEm: ts
      };
    } catch (e) {
      console.warn("[export-local] failed to copy selected image; continuing", {
        productId: productIdRaw,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const metaDir = path.join(productDir, metaDirName);
  await ensureDir(metaDir);
  await fsp.writeFile(path.join(metaDir, metaName), JSON.stringify(meta, null, 2), "utf8");

  console.log("[prompt-export] before", {
    productId: productIdRaw,
    repoRoot,
    productDir,
    metaName: `${metaDirName}/${metaName}`,
    hasMetadata: !!meta
  });
  const promptGeneration = await tryGenerateCommercialPromptOutputs({ repoRoot, productDir, metadata: meta });
  console.log("[prompt-export] after", {
    productId: productIdRaw,
    success: promptGeneration?.success === true,
    error: promptGeneration?.success ? null : promptGeneration?.error,
    files: promptGeneration?.success ? promptGeneration?.files : null
  });
  if (!promptGeneration.success) {
    console.error("[prompt-export] failed", { productId: productIdRaw, error: promptGeneration.error });
  }

  const structured = await tryGenerateStructuredPromptOutputs({ productId: productIdRaw, productDir });
  if (!structured.success) {
    console.warn("[structured-prompt] failed", { productId: productIdRaw, error: structured.error });
  }

  return reply.send({
    ok: true,
    productId: productIdRaw,
    dir: productDir,
    imagesSaved: written.length,
    imagesFailed: failed.length,
    link: linkOut,
    promptGeneration
  });
});

registerPdpEnrichRoute(fastify);
registerImportOutputRoute(fastify);
registerImagesUploadRoute(fastify);
registerScrapeRunRoute(fastify);
registerScrapeAllRoute(fastify);

const graceful = async () => {
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", graceful);
process.on("SIGTERM", graceful);

await fastify.listen({ port, host });
// eslint-disable-next-line no-console
console.log(`Analytics API em http://${host}:${port} (uso: Authorization Bearer ou X-API-Key)\n`);
