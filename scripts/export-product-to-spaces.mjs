/**
 * Exporta um produto (Postgres/Prisma) para DigitalOcean Spaces:
 * produto.json + imagens do último snapshot (pdpImages + images).
 *
 * Uso:
 *   node --env-file=.env scripts/export-product-to-spaces.mjs --product-id <TIKTOK_PRODUCT_ID>
 *
 * Opcional:
 *   --dry-run           só imprime prefixo e JSON (sem S3 nem fetch)
 *   --skip-images       só produto.json
 *
 * Env: DATABASE_URL + as mesmas SPACES_* do teste Spaces (excepto em --dry-run com produto).
 * Opcional: SPACES_OBJECTS_PUBLIC_READ=1 — objectos com leitura pública (URLs CDN abrem imagem no browser).
 */
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { requireDatabaseUrl } from "./analytics/_common.mjs";
import {
  buildProductExportPrefix,
  DEFAULT_PLATFORM,
  resolvedExportRoot
} from "./lib/spaces-export-paths.mjs";
import { exportProductToSpaces } from "./lib/export-product-to-spaces-core.mjs";

async function main() {
  const { values } = parseArgs({
    options: {
      "product-id": { type: "string", short: "p" },
      "dry-run": { type: "boolean", default: false },
      "skip-images": { type: "boolean", default: false }
    },
    allowPositionals: true,
    strict: false
  });

  const productIdArg = typeof values["product-id"] === "string" ? values["product-id"].trim() : "";
  const dryRun = Boolean(values["dry-run"]);
  const skipImages = Boolean(values["skip-images"]);

  if (!productIdArg && !dryRun) {
    throw new Error(
      "Indique --product-id <id_tiktok> (ex.: --product-id 1732593847560123456). Ou --dry-run para validar só parse."
    );
  }

  const quickDryOnly = dryRun && !productIdArg;
  if (!quickDryOnly) {
    requireDatabaseUrl();
  }

  /** @type {import("@prisma/client").PrismaClient | null} */
  let prisma = null;

  try {
    if (dryRun && !productIdArg) {
      const prefixDry = buildProductExportPrefix({
        root: resolvedExportRoot(),
        platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
        categorySlug: "dry-run-demo",
        productName: "exemplo-produto",
        productId: "000000"
      });
      console.log(JSON.stringify({ dryRun: true, prefix: prefixDry }, null, 2));
      return;
    }

    prisma = new PrismaClient();
    const result = await exportProductToSpaces(prisma, productIdArg, { dryRun, skipImages });

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            prefix: result.prefix,
            productId: result.productId,
            imageCandidates: result.imageCandidates
          },
          null,
          2
        )
      );
      return;
    }

    for (const im of /** @type {{ key: string, sourceUrl: string }[]} */ (
      Array.isArray(result.uploadedImages) ? result.uploadedImages : []
    )) {
      console.log(`IMG:  s3://${result.bucket}/${im.key}`);
    }
    console.log(`JSON: s3://${result.bucket}/${result.jsonKey}`);
    console.log(`Prefixo: ${result.prefix}/`);
    console.log(
      JSON.stringify(
        {
          imagesUploaded: result.imagesUploaded,
          imagesDiscovered: result.imagesDiscovered,
          imagesFailed: result.imagesFailed
        },
        null,
        2
      )
    );
  } finally {
    if (prisma != null) {
      await prisma.$disconnect();
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
