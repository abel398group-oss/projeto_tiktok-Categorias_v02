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
import { getOpportunitiesReport } from "./lib/opportunities.mjs";
import { getProductScoreReport } from "./lib/product-score.mjs";
import { getTopProductsReport } from "./lib/top-products.mjs";
import { getScalableProductsReport } from "./scalable-products.mjs";
import { getCategoryMapReport } from "./category-map.mjs";
import { exportProductToSpaces } from "../lib/export-product-to-spaces-core.mjs";

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

fastify.get("/analytics/top-products", async () => getTopProductsReport(prisma));

fastify.get("/analytics/opportunities", async () => getOpportunitiesReport(prisma));

fastify.get("/analytics/product-score", async () => getProductScoreReport(prisma));

fastify.get("/analytics/new-products", async () => getNewProductsReport(prisma));

fastify.get("/analytics/growth", async () => getGrowthReport(prisma));

fastify.get("/analytics/scalable-products", async () => getScalableProductsReport(prisma));

fastify.get("/analytics/category-map", async () => getCategoryMapReport(prisma));

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
