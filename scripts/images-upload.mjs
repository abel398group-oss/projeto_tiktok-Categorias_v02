import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { createSpacesS3Client, readSpacesConfigFromEnv, headObjectExists, putObjectBuffer, buildSpacesObjectKey, buildSpacesPublicUrl } from "./lib/spaces-s3.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return "";
  return next;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function toIntEnvOrArg(envKey, argName, fallback) {
  const rawArg = argValue(argName);
  const raw = rawArg != null && rawArg !== "" ? rawArg : process.env[envKey];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function pickExtension(ct, url) {
  try {
    const pathname = new URL(url).pathname;
    const m = pathname.match(/\.(webp|jpe?g|png|gif|avif)(?:\?|$)/i);
    if (m) {
      const e = m[1].toLowerCase();
      return e === "jpeg" ? "jpg" : e;
    }
  } catch {}
  const c = String(ct || "").toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("jpeg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("gif")) return "gif";
  if (c.includes("avif")) return "avif";
  return "bin";
}

function isImageContentType(ct) {
  const c = String(ct || "").toLowerCase().trim();
  return c.startsWith("image/");
}

async function fetchBinaryLimited(url, { timeoutMs, maxBytes, userAgent }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: userAgent ? { "User-Agent": userAgent } : undefined
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!isImageContentType(ct)) {
      throw new Error(`Content-Type inválido: ${ct || "(vazio)"}`);
    }
    const cl = Number(res.headers.get("content-length") || "");
    if (Number.isFinite(cl) && cl > maxBytes) {
      throw new Error(`Ficheiro demasiado grande (content-length ${cl} > ${maxBytes})`);
    }
    if (!res.body) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) {
        throw new Error(`Ficheiro demasiado grande (${buf.length} > ${maxBytes})`);
      }
      return { buf, contentType: ct || "application/octet-stream" };
    }
    const stream = Readable.fromWeb(res.body);
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += b.length;
      if (total > maxBytes) {
        ctrl.abort();
        throw new Error(`Ficheiro demasiado grande (${total} > ${maxBytes})`);
      }
      chunks.push(b);
    }
    const buf = Buffer.concat(chunks);
    return { buf, contentType: ct || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(label, attempts, fn) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts - 1) {
        console.warn(`[images] ${label} falhou (tentativa ${i + 1}/${attempts}): ${msg}`);
        await new Promise((r) => setTimeout(r, 450 + Math.random() * 650));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function normalizeImageUrlList(item) {
  const urls = [];
  const a = item && typeof item === "object" ? item : {};
  const fotos = Array.isArray(a.fotos) ? a.fotos : [];
  const fotosPdp = Array.isArray(a.fotos_pdp) ? a.fotos_pdp : [];
  for (const raw of [...fotos, ...fotosPdp]) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;
    urls.push(s);
  }
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function sanitizeProductId(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.replace(/[^0-9A-Za-z._-]/g, "_");
}

async function main() {
  const t0 = Date.now();
  const inputRel = argValue("--input") || "output/dados_produtos.json";
  const outRel = argValue("--out") || "output/dados_produtos_com_storage.json";
  const inputAbs = path.isAbsolute(inputRel) ? inputRel : path.join(root, inputRel);
  const outAbs = path.isAbsolute(outRel) ? outRel : path.join(root, outRel);

  const dryRun = hasFlag("--dry-run") || process.env.DRY_RUN === "1";
  const timeoutMs = toIntEnvOrArg("IMAGES_UPLOAD_TIMEOUT_MS", "--timeout-ms", 25_000);
  const maxBytes = toIntEnvOrArg("IMAGES_UPLOAD_MAX_BYTES", "--max-bytes", 8 * 1024 * 1024);
  const maxProducts = toIntEnvOrArg("IMAGES_UPLOAD_MAX_PRODUCTS", "--max-products", 0);
  const downloadRetries = toIntEnvOrArg("IMAGES_UPLOAD_RETRIES", "--retries", 2);

  const raw = await readFile(inputAbs, "utf8");
  const parsed = JSON.parse(raw);
  const itens = Array.isArray(parsed?.itens) ? parsed.itens : [];
  const productIdFilter = argValue("--product-id");
  const wantedPid = productIdFilter != null && productIdFilter.trim() !== "" ? productIdFilter.trim() : null;

  const cfg = dryRun ? null : readSpacesConfigFromEnv();
  const s3 = dryRun ? null : createSpacesS3Client(cfg);

  if (!dryRun) {
    console.log(
      `[images] Spaces: endpoint=${cfg.endpoint} bucket=${cfg.bucket} prefix=${cfg.prefix} publicRead=${cfg.publicRead ? "1" : "0"}`
    );
    console.log(`[images] Input: ${path.relative(root, inputAbs).split(path.sep).join("/")}`);
  } else {
    console.log(`[images] DRY RUN (sem upload). Input: ${path.relative(root, inputAbs).split(path.sep).join("/")}`);
  }

  const mapping = [];
  const seenObjectKeys = new Set();
  const stats = {
    productsSeen: 0,
    productsWithImages: 0,
    imagesSeen: 0,
    imagesDownloaded: 0,
    uploaded: 0,
    skippedAlreadyExists: 0,
    skippedDuplicateInRun: 0,
    failed: 0
  };

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const productId = sanitizeProductId(item?.product_id);
    if (!productId) continue;
    if (wantedPid && productId !== wantedPid) continue;

    stats.productsSeen += 1;

    const urls = normalizeImageUrlList(item);
    if (urls.length === 0) continue;
    if (maxProducts > 0 && stats.productsWithImages >= maxProducts) break;
    stats.productsWithImages += 1;

    console.log(`[images] Produto ${productId}: ${urls.length} URL(s)`);

    for (let j = 0; j < urls.length; j++) {
      const sourceUrl = urls[j];
      stats.imagesSeen += 1;

      let u;
      try {
        u = new URL(sourceUrl);
      } catch {
        mapping.push({
          productId,
          originalImageUrl: sourceUrl,
          storageUrl: null,
          objectKey: null,
          error: "url_invalida"
        });
        stats.failed += 1;
        continue;
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        mapping.push({
          productId,
          originalImageUrl: sourceUrl,
          storageUrl: null,
          objectKey: null,
          error: "protocolo_invalido"
        });
        stats.failed += 1;
        continue;
      }

      try {
        const { buf, contentType } = await withRetry(
          `download ${productId} #${j + 1}`,
          downloadRetries,
          async () =>
            fetchBinaryLimited(sourceUrl, {
              timeoutMs,
              maxBytes,
              userAgent: "tiktok-analytics-images-upload/1.0"
            })
        );
        stats.imagesDownloaded += 1;

        const sha = createHash("sha256").update(buf).digest("hex");
        const ext = pickExtension(contentType, sourceUrl);
        const leaf = `${sha}.${ext}`;

        const objectKey = dryRun ? `${"tiktok-analytics/products"}/${productId}/${leaf}` : buildSpacesObjectKey(cfg, productId, leaf);
        const storageUrl = dryRun ? null : buildSpacesPublicUrl(cfg, objectKey);

        if (seenObjectKeys.has(objectKey)) {
          mapping.push({
            productId,
            originalImageUrl: sourceUrl,
            storageUrl,
            objectKey,
            skipped: "duplicate_in_run"
          });
          stats.skippedDuplicateInRun += 1;
          continue;
        }
        seenObjectKeys.add(objectKey);

        if (!dryRun) {
          const exists = await headObjectExists(s3, cfg.bucket, objectKey);
          if (exists) {
            mapping.push({
              productId,
              originalImageUrl: sourceUrl,
              storageUrl,
              objectKey,
              skipped: "already_exists"
            });
            stats.skippedAlreadyExists += 1;
            continue;
          }
          await withRetry(`upload ${productId} #${j + 1}`, 2, async () =>
            putObjectBuffer(s3, cfg.bucket, objectKey, buf, {
              contentType,
              cacheControl: "public, max-age=31536000, immutable",
              publicRead: cfg.publicRead
            })
          );
          stats.uploaded += 1;
          mapping.push({ productId, originalImageUrl: sourceUrl, storageUrl, objectKey });
          console.log(
            `[images] OK ${productId} #${j + 1}: ${ext} ${Math.round(buf.length / 1024)}KiB → ${objectKey}`
          );
        } else {
          mapping.push({ productId, originalImageUrl: sourceUrl, storageUrl, objectKey });
          console.log(`[images] DRY ${productId} #${j + 1}: ${ext} ${Math.round(buf.length / 1024)}KiB`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        mapping.push({ productId, originalImageUrl: sourceUrl, storageUrl: null, objectKey: null, error: msg });
        stats.failed += 1;
        console.warn(`[images] ERRO ${productId} #${j + 1}: ${msg}`);
      }
    }
  }

  await mkdir(path.dirname(outAbs), { recursive: true });
  const outPayload = {
    generated_at: new Date().toISOString(),
    input_file: path.relative(root, inputAbs).split(path.sep).join("/"),
    dry_run: Boolean(dryRun),
    spaces:
      dryRun
        ? { note: "dry-run sem credenciais; objectKey é estimado e storageUrl depende de SPACES_PUBLIC_BASE_URL." }
        : {
            endpoint: cfg.endpoint,
            region: cfg.region,
            bucket: cfg.bucket,
            prefix: cfg.prefix,
            public_base_url: cfg.publicBaseUrl
          },
    limits: { timeout_ms: timeoutMs, max_bytes: maxBytes, retries: downloadRetries },
    stats,
    items: mapping.map((m) => ({
      productId: m.productId,
      originalImageUrl: m.originalImageUrl,
      storageUrl: m.storageUrl ?? null,
      objectKey: m.objectKey ?? null,
      ...(m.skipped ? { skipped: m.skipped } : {}),
      ...(m.error ? { error: m.error } : {})
    }))
  };
  await writeFile(outAbs, JSON.stringify(outPayload, null, 2), "utf8");

  const outRelNorm = path.relative(root, outAbs).split(path.sep).join("/");
  const ms = Date.now() - t0;
  console.log(`[images] Concluído. output: ${outRelNorm}`);
  console.log(
    `[images] Stats: productsSeen=${stats.productsSeen} productsWithImages=${stats.productsWithImages} imagesSeen=${stats.imagesSeen} downloaded=${stats.imagesDownloaded} uploaded=${stats.uploaded} skippedExists=${stats.skippedAlreadyExists} skippedDupRun=${stats.skippedDuplicateInRun} failed=${stats.failed} ms=${ms}`
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[images] Falha fatal: ${msg}`);
  process.exit(1);
});
