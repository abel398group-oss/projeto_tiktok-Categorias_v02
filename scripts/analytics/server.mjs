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
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLatestAndPreviousRun, requireDatabaseUrl } from "./_common.mjs";
import { getGrowthReport } from "./lib/growth.mjs";
import { getNewProductsReport } from "./lib/new-products.mjs";
import {
  clampOpportunitiesLimit,
  getOpportunitiesReport,
  parseOpportunityMode
} from "./lib/opportunities.mjs";
import { getProductScoreReport } from "./lib/product-score.mjs";
import { clampTopProductsLimit, getTopProductsReport } from "./lib/top-products.mjs";
import { getScalableProductsReport } from "./scalable-products.mjs";
import { getCategoryMapReport } from "./category-map.mjs";
import { getProductWorkspaceDetail } from "./lib/product-workspace.mjs";
import { buildImagesZipBuffer } from "./lib/product-images-zip.mjs";
import { extractOrderedImageUrls } from "../lib/extract-image-urls.mjs";
import { registerPdpEnrichRoute } from "./pdp-enrich-route.mjs";
import { registerImportOutputRoute } from "./import-output-route.mjs";
import { registerImagesUploadRoute } from "./images-upload-route.mjs";
import { registerScrapeRunRoute } from "./scrape-run-route.mjs";
import { listImportedCategories } from "./lib/categories-catalog.mjs";

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

const prisma = new PrismaClient();
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
  return getTopProductsReport(prisma, {
    ...(categoryUrl !== "" ? { categoryUrl } : {}),
    limit
  });
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
  return getOpportunitiesReport(prisma, {
    ...(categoryUrl !== "" ? { categoryUrl } : {}),
    limit,
    mode
  });
});


fastify.get("/analytics/product-score", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return getProductScoreReport(prisma, categoryUrl !== "" ? { categoryUrl } : {});
});

fastify.get("/analytics/new-products", async () => getNewProductsReport(prisma));

fastify.get("/analytics/growth", async (req) => {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return getGrowthReport(prisma, categoryUrl !== "" ? { categoryUrl } : {});
});

async function scalableProductsFromQuery(req) {
  const raw = req.query?.categoryUrl;
  const categoryUrl =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";
  return getScalableProductsReport(prisma, categoryUrl !== "" ? { categoryUrl } : {});
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
  return getCategoryMapReport(prisma, categoryUrl !== "" ? { categoryUrl } : {});
});

fastify.get("/analytics/categories", async () => listImportedCategories(prisma));

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

async function pickDocumentsDir() {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Documents"),
    path.join(home, "OneDrive", "Documents"),
    path.join(home, "Documentos"),
    path.join(home, "OneDrive", "Documentos")
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
    }
  }
  return candidates[0];
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
  if (!productIdRaw || !isDigitsOnly(productIdRaw)) {
    return reply.code(400).send({
      ok: false,
      error: "bad_request",
      message: "productId deve conter apenas dígitos."
    });
  }

  const docsDir = await pickDocumentsDir();
  const baseDir = path.join(docsDir, "Scraper-TikTok-Produtos");

  let resolved = await resolveProductSnapshotForExport(productIdRaw);
  if ("error" in resolved) {
    const { error, message } = resolved;
    if (error === "bad_request") return reply.code(400).send({ ok: false, error, message });
    if (error === "not_found" || error === "no_snapshot") return reply.code(404).send({ ok: false, error, message });
    return reply.code(503).send({ ok: false, error, message });
  }

  const { product, snap } = resolved;
  let urls = extractOrderedImageUrls(snap);
  const hasAny = urls.some((u) => typeof u === "string" && u.trim().startsWith("http"));
  if (!hasAny) {
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
    resolved = await resolveProductSnapshotForExport(productIdRaw);
    if ("error" in resolved) {
      return reply.code(503).send({ ok: false, error: resolved.error, message: resolved.message });
    }
    urls = extractOrderedImageUrls(resolved.snap);
  }

  const list = urls.filter((u) => typeof u === "string" && u.trim().startsWith("http")).map((u) => u.trim());
  if (list.length === 0) {
    return reply.code(409).send({
      ok: false,
      error: "no_images",
      message: "Não há imagens disponíveis para exportar localmente (pdpImages vazio)."
    });
  }

  await ensureDir(baseDir);

  const nome = typeof product.name === "string" ? product.name.trim() : "";
  const slug = safeSlug(nome);
  const productDir = path.join(baseDir, `${slug}_${productIdRaw}`);
  const imagesDir = path.join(productDir, "imagens");
  await ensureDir(imagesDir);

  const link = typeof product.productUrl === "string" && product.productUrl.trim() ? product.productUrl.trim() : null;
  const linkOut = link || `https://www.tiktok.com/shop/br/pdp/${encodeURIComponent(productIdRaw)}`;

  const ts = new Date().toISOString();
  const written = [];
  const failed = [];

  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    try {
      const { buf, contentType } = await fetchImageBuffer(url);
      const ext = pickImageExt(contentType, url);
      const slot = String(i + 1).padStart(3, "0");
      const fname = `imagem-${slot}.${ext}`;
      const outPath = path.join(imagesDir, fname);
      await fsp.writeFile(outPath, buf);
      written.push({ file: fname, url });
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const linkTxtName = `link_${productIdRaw}.txt`;
  const urlName = `produto_${productIdRaw}.url`;
  const metaName = `metadata_${productIdRaw}.json`;

  await fsp.writeFile(path.join(productDir, linkTxtName), `${linkOut}\r\n`, "utf8");
  await fsp.writeFile(path.join(productDir, urlName), `[InternetShortcut]\r\nURL=${linkOut}\r\n`, "utf8");

  const meta = {
    productId: productIdRaw,
    sellerId: product.seller?.sellerId ?? null,
    nome: nome || "—",
    categoria: product.categoryUrl ?? null,
    exportedAt: ts,
    images: { total: list.length, saved: written.length, failed: failed.length, files: written }
  };
  await fsp.writeFile(path.join(productDir, metaName), JSON.stringify(meta, null, 2), "utf8");

  return reply.send({
    ok: true,
    productId: productIdRaw,
    dir: productDir,
    imagesSaved: written.length,
    imagesFailed: failed.length,
    link: linkOut
  });
});

registerPdpEnrichRoute(fastify);
registerImportOutputRoute(fastify);
registerImagesUploadRoute(fastify);
registerScrapeRunRoute(fastify);

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
