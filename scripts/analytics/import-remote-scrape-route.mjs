/**
 * POST /scrape/import-remote — importação a partir do worker local (Puppeteer fora do contentor).
 * Auth: mesma `ANALYTICS_API_KEY` que o resto da API (Bearer ou `x-api-key`).
 */
/* eslint-disable no-console -- logs operacionais */
import { importOutputFromStrings } from "../lib/import-output-core.mjs";

const BODY_LIMIT = Math.min(
  Number(process.env.IMPORT_REMOTE_BODY_LIMIT_BYTES) || 104857600,
  512 * 1024 * 1024
);

/**
 * @param {import("fastify").FastifyInstance} fastify
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export function registerImportRemoteScrapeRoute(fastify, prisma) {
  fastify.post(
    "/scrape/import-remote",
    {
      bodyLimit: BODY_LIMIT
    },
    async (req, reply) => {
      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

      const produtosText =
        typeof body.dados_produtos_text === "string"
          ? body.dados_produtos_text
          : body.dados_produtos != null
            ? JSON.stringify(body.dados_produtos)
            : null;

      if (produtosText == null || produtosText === "") {
        return reply.code(400).send({
          ok: false,
          error: "bad_request",
          message:
            "Corpo JSON obrigatório: `dados_produtos_text` (string UTF-8 exacta do ficheiro) ou `dados_produtos` (object). Para o mesmo input_hash que o CLI, envie a string do ficheiro."
        });
      }

      let lojasTextOrAbsent = "__NO_DADOS_LOJAS_FILE__";
      if (body.dados_lojas_text != null) {
        if (typeof body.dados_lojas_text !== "string") {
          return reply.code(400).send({
            ok: false,
            error: "bad_request",
            message: "`dados_lojas_text` tem de ser string (conteúdo do ficheiro) ou omitir."
          });
        }
        lojasTextOrAbsent = body.dados_lojas_text;
      } else if (body.dados_lojas != null) {
        lojasTextOrAbsent = JSON.stringify(body.dados_lojas);
      }

      /** @type {"quick_scrape" | "pdp_enrich" | "unknown" | undefined} */
      let runType;
      const rt = body.import_run_type;
      if (rt === "quick_scrape" || rt === "pdp_enrich" || rt === "unknown") {
        runType = rt;
      } else if (rt != null && rt !== "") {
        return reply.code(400).send({
          ok: false,
          error: "bad_request",
          message: "import_run_type inválido. Use quick_scrape | pdp_enrich | unknown."
        });
      }

      const rawPayloadExtra =
        body.raw_payload_extra != null && typeof body.raw_payload_extra === "object"
          ? body.raw_payload_extra
          : undefined;

      try {
        const result = await importOutputFromStrings(prisma, {
          produtosText,
          lojasTextOrAbsent,
          ...(runType != null ? { runType } : {}),
          rawPayloadExtra
        });

        if (result.skipped) {
          console.log(
            "[import-remote] skipped inputHash=%s existingRun=%s",
            result.inputHash?.slice(0, 16),
            result.existingScrapeRunId
          );
          return reply.send({
            ok: true,
            skipped: true,
            message: "Importação ignorada: mesmo input_hash já importado.",
            detail: {
              existingScrapeRunId: result.existingScrapeRunId,
              inputHash: result.inputHash
            }
          });
        }

        console.log("[import-remote] OK scrapeRunId=%s inputHash=%s…", result.scrapeRunId, result.inputHash?.slice(0, 16));
        return reply.send({
          ok: true,
          skipped: false,
          message: "Import remoto concluído (JSON → Postgres).",
          detail: {
            scrapeRunId: result.scrapeRunId,
            inputHash: result.inputHash,
            productsUpserted: result.productsUpserted,
            productSnapshotsCreated: result.productSnapshotsCreated,
            sellerSnapshotsCreated: result.sellerSnapshotsCreated,
            rawPayloadId: result.rawPayloadId,
            uniqueSellerCount: result.uniqueSellerCount
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[import-remote] erro:", msg);
        return reply.code(400).send({ ok: false, error: "import_failed", message: msg });
      }
    }
  );
}
