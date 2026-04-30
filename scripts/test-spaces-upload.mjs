/**
 * Teste mínimo: conexão DigitalOcean Spaces + PutObject de um ficheiro em memória.
 * Não usa API HTTP, Prisma nem downloads.
 *
 * Uso: node --env-file=.env scripts/test-spaces-upload.mjs
 * (ou `npm run test:spaces` na raiz do projeto)
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const required = [
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_ACCESS_KEY_ID",
  "SPACES_SECRET_ACCESS_KEY"
];

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") {
    throw new Error(`Variável de ambiente obrigatória em falta: ${name}`);
  }
  return String(v).trim();
}

/** @param {string | undefined} raw */
function normalizePrefix(raw) {
  if (raw == null || String(raw).trim() === "") return "";
  return String(raw).replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * URL pública típica Spaces (virtual-hosted). Opcional: SPACES_PUBLIC_BASE_URL
 * (ex. CDN) — se definido, usa `${base}/${key}`.
 * @param {{ bucket: string, region: string, key: string }} p
 */
function publicObjectUrl(p) {
  const custom = process.env.SPACES_PUBLIC_BASE_URL?.trim();
  if (custom) {
    const base = custom.replace(/\/+$/, "");
    return `${base}/${p.key}`;
  }
  const host = `${p.bucket}.${p.region}.digitaloceanspaces.com`;
  const path = p.key.split("/").map(encodeURIComponent).join("/");
  return `https://${host}/${path}`;
}

async function main() {
  for (const k of required) {
    requireEnv(k);
  }

  const endpoint = requireEnv("SPACES_ENDPOINT");
  const region = requireEnv("SPACES_REGION");
  const bucket = requireEnv("SPACES_BUCKET");
  const accessKeyId = requireEnv("SPACES_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("SPACES_SECRET_ACCESS_KEY");
  const prefix = normalizePrefix(process.env.SPACES_BASE_PATH);
  const key = prefix ? `${prefix}/teste.txt` : "product-research/teste.txt";

  const bodyText = "teste export funcionando";
  const body = Buffer.from(bodyText, "utf8");

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    /** Espaços DO costumam responder melhor com path-style no SDK v3. */
    forcePathStyle: true
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain; charset=utf-8"
    })
  );

  const url = publicObjectUrl({ bucket, region, key });

  // eslint-disable-next-line no-console
  console.log("Upload concluído.");
  // eslint-disable-next-line no-console
  console.log(`  bucket: ${bucket}`);
  // eslint-disable-next-line no-console
  console.log(`  key:    ${key}`);
  // eslint-disable-next-line no-console
  console.log(`  url:    ${url}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(
    "Nota: a URL só abre sem login se o ficheiro (ou bucket) estiver público, ou usar URL assinada noutro passo."
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Falha no teste Spaces:", err?.message ?? err);
  if (err?.name) {
    // eslint-disable-next-line no-console
    console.error("  código/nome:", err.name);
  }
  if (err?.$metadata) {
    // eslint-disable-next-line no-console
    console.error("  requestId:", err.$metadata.requestId, "| httpStatus:", err.$metadata.httpStatusCode);
  }
  if (process.env.DEBUG_SPACES) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  process.exit(1);
});
