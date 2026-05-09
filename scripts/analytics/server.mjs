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
import { requireDatabaseUrl } from "./_common.mjs";
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
import { exportProductToSpaces } from "../lib/export-product-to-spaces-core.mjs";
import { registerPdpEnrichRoute } from "./pdp-enrich-route.mjs";
import { registerImportOutputRoute } from "./import-output-route.mjs";
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

/** Exporta um produto (ID TikTok) para Spaces; valida credenciais SPACES na primeira execução real. */
fastify.post("/analytics/export-product-to-spaces", async (req, reply) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const skipImages = Boolean(body.skipImages);
  if (!productId) {
    return reply
      .code(400)
      .send({ error: "bad_request", message: "Corpo JSON com productId (string) obrigatório." });
  }
  try {
    const result = await exportProductToSpaces(prisma, productId, { skipImages, dryRun: false });
    return reply.send(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Produto não encontrado") || msg.startsWith("Sem ProductSnapshot")) {
      return reply.code(404).send({ error: "not_found", message: msg });
    }
    if (msg.includes("em falta no .env")) {
      return reply.code(503).send({ error: "spaces_unconfigured", message: msg });
    }
    return reply.code(500).send({ error: "export_failed", message: msg });
  }
});

registerPdpEnrichRoute(fastify);
registerImportOutputRoute(fastify);
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
