/**
 * API HTTP read-only dos mesmos relatórios que os comandos npm run analytics:*.
 *
 * Env: DATABASE_URL (obrig.), ANALYTICS_API_KEY (obrig.), ANALYTICS_API_PORT / HOST opcionais.
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
