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
 * Env: DATABASE_URL + as mesmas SPACES_* do teste Spaces.
 * Opcional: SPACES_OBJECTS_PUBLIC_READ=1 — objectos com leitura pública (URLs CDN abrem imagem no browser).
 */
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { requireDatabaseUrl } from "./analytics/_common.mjs";
import { extractOrderedImageUrls } from "./lib/extract-image-urls.mjs";
import {
  buildProductExportPrefix,
  deriveCategorySlugFromUrl,
  DEFAULT_PLATFORM,
  resolvedExportRoot
} from "./lib/spaces-export-paths.mjs";
import { createSpacesS3Client, putSpacesObject, spacesPutExtrasFromEnv } from "./lib/spaces-s3.mjs";

const spacesVars = [
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_ACCESS_KEY_ID",
  "SPACES_SECRET_ACCESS_KEY"
];

/** @param {string} name */
function requireTrim(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") {
    throw new Error(`${name} em falta no .env`);
  }
  return String(v).trim();
}

/** @param {string} ct @param {string} url */
function pickExtension(ct, url) {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.(webp|jpe?g|png|gif)(?:\?|$)/i);
    if (m) {
      const e = m[1].toLowerCase();
      return e === "jpeg" ? "jpg" : e;
    }
  } catch {
    /* ignore */
  }
  const c = (ct || "").toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("jpeg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("gif")) return "gif";
  return "bin";
}

/** MIME explícito para o browser tratar como imagem (webp/jpg/png/gif). */
/** @param {string} ext @param {string} responseContentType */
function mimeForImageByExt(ext, responseContentType) {
  const e = (ext || "").toLowerCase();
  if (e === "webp") return "image/webp";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "gif") return "image/gif";
  if (responseContentType && /^image\//i.test(String(responseContentType).trim())) {
    return String(responseContentType).trim();
  }
  return "application/octet-stream";
}

/**
 * @param {string} url
 * @param {number} maxBytes
 * @param {number} timeoutMs
 */
async function downloadBinary(url, maxBytes, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "tiktok-shop-product-export/1.0 (projeto local)" }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const cl = res.headers.get("content-length");
    if (cl != null && Number(cl) > maxBytes) {
      throw new Error(`Content-Length ${cl} > máx ${maxBytes}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Corpo ${buf.length} bytes > máx ${maxBytes}`);
    }
    return {
      buf,
      contentType: res.headers.get("content-type") || "application/octet-stream"
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Exclude<Awaited<ReturnType<PrismaClient["product"]["findUnique"]>>, null>} product
 */
function snapshotPlain(snap) {
  if (!snap) return null;
  return {
    id: snap.id,
    scrapeRunId: snap.scrapeRunId,
    capturedAt: snap.capturedAt instanceof Date ? snap.capturedAt.toISOString() : snap.capturedAt,
    price: snap.price ?? null,
    originalPrice: snap.originalPrice ?? null,
    hasDiscount: snap.hasDiscount,
    estimatedShowcasePrice: snap.estimatedShowcasePrice ?? null,
    estimatedPriceGap: snap.estimatedPriceGap ?? null,
    estimatedPriceGapPercent: snap.estimatedPriceGapPercent ?? null,
    salesCount: snap.salesCount ?? null,
    salesText: snap.salesText ?? null,
    ratingAverage: snap.ratingAverage ?? null,
    ratingTotal: snap.ratingTotal ?? null,
    votesByStar: snap.votesByStar ?? null,
    images: snap.images ?? null,
    pdpImages: snap.pdpImages ?? null,
    dataQuality: snap.dataQuality ?? null
  };
}

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

  const maxImg = Number(process.env.EXPORT_IMAGE_MAX) || 15;
  const maxBytes =
    Number(process.env.EXPORT_IMAGE_MAX_BYTES) > 0
      ? Number(process.env.EXPORT_IMAGE_MAX_BYTES)
      : 12 * 1024 * 1024;
  const timeoutMs = Number(process.env.EXPORT_IMAGE_TIMEOUT_MS) || 25000;

  const quickDryOnly = dryRun && !productIdArg;
  if (!quickDryOnly) {
    requireDatabaseUrl();
  }

  for (const k of spacesVars) {
    if (!dryRun) requireTrim(k);
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
    /** @type {string} */
    let prefix = "";
    const product = await prisma.product.findUnique({
      where: { productId: productIdArg },
      include: {
        seller: { select: { sellerId: true, name: true } },
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      }
    });

    if (!product) {
      throw new Error(`Produto não encontrado: productId=${productIdArg}`);
    }
    const snap = product.snapshots[0];
    if (!snap) {
      throw new Error(`Sem ProductSnapshot para este produto (importa dados primeiro).`);
    }

    const exportRoot = resolvedExportRoot();
    const categorySlug = deriveCategorySlugFromUrl(product.categoryUrl);
    prefix = buildProductExportPrefix({
      root: exportRoot,
      platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
      categorySlug,
      productName: product.name,
      productId: product.productId
    });

    const imageUrls = extractOrderedImageUrls(snap);
    const toFetch = imageUrls.slice(0, maxImg);

    /** @type {{ key: string, sourceUrl: string, error?: string }[]} */
    const imagesOut = [];
    /** @type {{ url: string, error: string }[]} */
    const imagesFailed = [];

    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      export: {
        root: exportRoot,
        platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
        prefix,
        limits: { maxImages: maxImg, maxBytesPerImage: maxBytes, fetchTimeoutMs: timeoutMs },
        publicRead:
          typeof process.env.SPACES_OBJECTS_PUBLIC_READ === "string" &&
          ["1", "true", "yes"].includes(process.env.SPACES_OBJECTS_PUBLIC_READ.trim().toLowerCase())
      },
      product: {
        id: product.id,
        productId: product.productId,
        name: product.name,
        productUrl: product.productUrl,
        categoryUrl: product.categoryUrl,
        categorySlug
      },
      seller: product.seller
        ? { sellerId: product.seller.sellerId, name: product.seller.name }
        : null,
      snapshot: snapshotPlain(snap),
      images: {
        discovered: imageUrls.length,
        uploaded: 0,
        objects: /** @type {{ key: string, sourceUrl: string }[]} */ ([]),
        failed: /** @type {{ url: string, error: string }[]} */ ([])
      }
    };

    if (dryRun) {
      console.log(JSON.stringify({ prefix, productId: product.productId, imageCandidates: toFetch.length }, null, 2));
      return;
    }

    const endpoint = requireTrim("SPACES_ENDPOINT");
    const region = requireTrim("SPACES_REGION");
    const bucket = requireTrim("SPACES_BUCKET");
    const accessKeyId = requireTrim("SPACES_ACCESS_KEY_ID");
    const secretAccessKey = requireTrim("SPACES_SECRET_ACCESS_KEY");

    const client = createSpacesS3Client({ endpoint, region, accessKeyId, secretAccessKey });
    const acl = spacesPutExtrasFromEnv();

    const jsonKey = `${prefix}/produto.json`;

    if (!skipImages && toFetch.length > 0) {
      for (let i = 0; i < toFetch.length; i++) {
        const url = toFetch[i];
        const slot = String(i + 1).padStart(2, "0");
        try {
          const { buf, contentType } = await downloadBinary(url, maxBytes, timeoutMs);
          const ext = pickExtension(contentType, url);
          const mime = mimeForImageByExt(ext, contentType);
          const key = `${prefix}/imagem-${slot}.${ext}`;
          await putSpacesObject(client, bucket, key, buf, mime, acl);
          imagesOut.push({ key, sourceUrl: url });
          console.log(`IMG:  s3://${bucket}/${key}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          imagesFailed.push({ url, error: msg });
          console.warn(`IMG falhou [${slot}]: ${msg}`);
        }
      }
    }

    payload.images.uploaded = imagesOut.length;
    payload.images.objects = imagesOut.map(({ key, sourceUrl }) => ({ key, sourceUrl }));
    payload.images.failed = imagesFailed;

    await putSpacesObject(
      client,
      bucket,
      jsonKey,
      Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
      "application/json; charset=utf-8",
      acl
    );
    console.log(`JSON: s3://${bucket}/${jsonKey}`);
    console.log(`Prefixo: ${prefix}/`);
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
