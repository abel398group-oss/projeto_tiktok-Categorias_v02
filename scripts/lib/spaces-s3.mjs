import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function truthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function mustString(env, key) {
  const v = env[key];
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    throw new Error(`${key} não definido (obrigatório).`);
  }
  return s;
}

function normalizePrefix(prefix) {
  const s = String(prefix ?? "").trim();
  if (!s) return "";
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}

function joinS3Key(...parts) {
  const clean = parts
    .flatMap((p) => String(p ?? "").split("/"))
    .map((s) => s.trim())
    .filter(Boolean);
  return clean.join("/");
}

function normalizePublicBaseUrl(v) {
  const s = String(v ?? "").trim().replace(/\/+$/, "");
  return s || null;
}

export function readSpacesConfigFromEnv(env = process.env) {
  const endpoint = mustString(env, "SPACES_ENDPOINT");
  const region = mustString(env, "SPACES_REGION");
  const bucket = mustString(env, "SPACES_BUCKET");
  const accessKeyId = mustString(env, "SPACES_ACCESS_KEY_ID");
  const secretAccessKey = mustString(env, "SPACES_SECRET_ACCESS_KEY");
  const publicBaseUrl = normalizePublicBaseUrl(env.SPACES_PUBLIC_BASE_URL);
  const prefix = normalizePrefix(env.SPACES_PREFIX ?? "analytics/tiktok/products");
  const publicRead = truthy(env.SPACES_OBJECTS_PUBLIC_READ);
  const forcePathStyle = truthy(env.SPACES_FORCE_PATH_STYLE);
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    prefix,
    publicRead,
    forcePathStyle
  };
}

export function createSpacesS3Client(cfg) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.forcePathStyle),
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    }
  });
}

export function buildSpacesObjectKey(cfg, productId, leafName) {
  const pid = String(productId ?? "").trim();
  const safePid = pid !== "" ? pid.replace(/[^a-zA-Z0-9._-]/g, "_") : "unknown";
  const leaf = String(leafName ?? "").trim().replace(/^\/+/, "");
  if (!leaf) {
    throw new Error("leafName vazio ao construir objectKey.");
  }
  return joinS3Key(cfg.prefix, safePid, leaf);
}

export function buildSpacesPublicUrl(cfg, objectKey) {
  if (!cfg.publicBaseUrl) return null;
  const key = String(objectKey ?? "").replace(/^\/+/, "");
  return `${cfg.publicBaseUrl}/${key}`;
}

export async function headObjectExists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
    const http = e && typeof e === "object" && "$metadata" in e ? e.$metadata : null;
    const code = http && typeof http === "object" && "httpStatusCode" in http ? Number(http.httpStatusCode) : NaN;
    if (name === "NotFound" || code === 404) return false;
    throw e;
  }
}

export async function putObjectBuffer(
  s3,
  bucket,
  key,
  buf,
  { contentType, cacheControl, publicRead }
) {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: buf,
    ContentType: contentType || "application/octet-stream",
    CacheControl: cacheControl || undefined,
    ACL: publicRead ? "public-read" : undefined
  };
  await s3.send(new PutObjectCommand(params));
}

