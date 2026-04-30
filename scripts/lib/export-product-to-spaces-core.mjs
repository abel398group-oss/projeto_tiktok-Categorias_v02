/**
 * Núcleo partilhado: export Product + último snapshot → DigitalOcean Spaces (produto.json + imagens).
 * Usado pelo CLI `scripts/export-product-to-spaces.mjs` e pela Analytics API POST.
 */
import { extractOrderedImageUrls } from "./extract-image-urls.mjs";
import {
  buildProductExportPrefix,
  deriveCategorySlugFromUrl,
  DEFAULT_PLATFORM,
  resolvedExportRoot
} from "./spaces-export-paths.mjs";
import { createSpacesS3Client, putSpacesObject, spacesPutExtrasFromEnv } from "./spaces-s3.mjs";

export const SPACES_ENV_KEYS = [
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

/** @param {*} snap resultado Prisma snapshot */
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

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} tiktokProductId
 * @param {{ skipImages?: boolean, dryRun?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function exportProductToSpaces(prisma, tiktokProductId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const skipImages = Boolean(options.skipImages);
  const productIdArg = String(tiktokProductId || "").trim();
  if (!productIdArg) {
    throw new Error("productId vazio");
  }

  const maxImg = Number(process.env.EXPORT_IMAGE_MAX) || 15;
  const maxBytes =
    Number(process.env.EXPORT_IMAGE_MAX_BYTES) > 0
      ? Number(process.env.EXPORT_IMAGE_MAX_BYTES)
      : 12 * 1024 * 1024;
  const timeoutMs = Number(process.env.EXPORT_IMAGE_TIMEOUT_MS) || 25000;

  if (!dryRun) {
    for (const k of SPACES_ENV_KEYS) {
      requireTrim(k);
    }
  }

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
  const prefix = buildProductExportPrefix({
    root: exportRoot,
    platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
    categorySlug,
    productName: product.name,
    productId: product.productId
  });

  const imageUrls = extractOrderedImageUrls(snap);
  const toFetch = imageUrls.slice(0, maxImg);

  /** @type {{ key: string, sourceUrl: string }[]} */
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
    return {
      ok: true,
      dryRun: true,
      prefix,
      productId: product.productId,
      imageCandidates: toFetch.length,
      imageDiscovered: imageUrls.length
    };
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        imagesFailed.push({ url, error: msg });
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

  const publicBase = process.env.SPACES_PUBLIC_BASE_URL?.trim();
  const baseTrim = publicBase ? publicBase.replace(/\/$/, "") : "";

  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    dryRun: false,
    productId: product.productId,
    prefix,
    bucket,
    jsonKey,
    imagesUploaded: imagesOut.length,
    imagesDiscovered: imageUrls.length,
    imagesFailed: imagesFailed.length,
    uploadedImages: imagesOut.map(({ key, sourceUrl }) => ({ key, sourceUrl })),
    failures: imagesFailed.slice(0, 25)
  };
  if (baseTrim) {
    out.publicUrls = {
      folder: `${baseTrim}/${prefix}/`,
      produtoJson: `${baseTrim}/${prefix}/produto.json`
    };
  }
  return out;
}
