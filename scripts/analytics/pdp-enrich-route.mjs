/**
 * POST /analytics/pdp-enrich — dispara o CLI existente `npm run pdp:enrich -- --ids=...` (processo em background).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

/**
 * @param {unknown} body
 * @returns {string[] | null} null se o corpo for inválido
 */
function normalizeProductIds(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (body).productIds;
  if (!Array.isArray(raw)) {
    return null;
  }
  /** @type {string[]} */
  const out = [];
  for (const x of raw) {
    if (typeof x !== "string") {
      continue;
    }
    const t = x.trim();
    if (!t || !/^\d+$/.test(t)) {
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerPdpEnrichRoute(fastify) {
  fastify.post("/analytics/pdp-enrich", async (req, reply) => {
    const ids = normalizeProductIds(req.body);
    if (ids == null) {
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message: 'Corpo JSON com productIds (array de strings) obrigatório.'
      });
    }
    if (ids.length === 0) {
      return reply.code(400).send({
        ok: false,
        error: "bad_request",
        message: "Nenhum productId válido (apenas dígitos)."
      });
    }

    const idsArg = ids.join(",");
    let child;
    try {
      child = spawn("npm", ["run", "pdp:enrich", "--", `--ids=${idsArg}`], {
        cwd: repoRoot,
        shell: true,
        detached: true,
        stdio: "ignore"
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ ok: false, error: "spawn_failed", message: msg });
    }

    child.unref();
    child.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[analytics/pdp-enrich] spawn:", err);
    });

    return reply.send({
      ok: true,
      message: "PDP enrich iniciado",
      productIds: ids
    });
  });
}
