/**
 * Teste: conexão DigitalOcean Spaces + PutObject (árvore de pastas acordada).
 *
 * Estrutura por defeito:
 *   {SPACES_EXPORT_ROOT}/{SPACES_EXPORT_PLATFORM}/{categoria}/{produto}__{id}/teste.txt
 *   + produto.json (metadata mínima)
 *
 * Modo legado (ficheiro único): EXPORT_SPACES_FLAT=1 → usa SPACES_BASE_PATH ou product-research/teste.txt
 *
 * Uso: node --env-file=.env scripts/test-spaces-upload.mjs
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildProductExportPrefix, DEFAULT_PLATFORM, DEFAULT_ROOT } from "./lib/spaces-export-paths.mjs";

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

  const flat = process.env.EXPORT_SPACES_FLAT === "1";

  /** @type {string} */
  let folderPrefix;
  /** @type {string} */
  let keyTeste;
  /** @type {string} */
  let keyMeta;

  if (flat) {
    const prefix = normalizePrefix(process.env.SPACES_BASE_PATH);
    keyTeste = prefix ? `${prefix}/teste.txt` : "product-research/teste.txt";
    keyMeta = "";
    folderPrefix = prefix || "product-research";
  } else {
    const categorySlug = process.env.SPACES_TEST_CATEGORY_SLUG?.trim() || "demo-categoria";
    const productName = process.env.SPACES_TEST_PRODUCT_NAME?.trim() || "produto-demo";
    const productId = process.env.SPACES_TEST_PRODUCT_ID?.trim() || "test-local-001";

    folderPrefix = buildProductExportPrefix({
      root: process.env.SPACES_EXPORT_ROOT?.trim() || DEFAULT_ROOT,
      platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
      categorySlug,
      productName,
      productId
    });
    keyTeste = `${folderPrefix}/teste.txt`;
    keyMeta = `${folderPrefix}/produto.json`;
  }

  const bodyText = "teste export funcionando";
  const body = Buffer.from(bodyText, "utf8");

  const metaJson = JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      root: process.env.SPACES_EXPORT_ROOT?.trim() || DEFAULT_ROOT,
      platform: process.env.SPACES_EXPORT_PLATFORM?.trim() || DEFAULT_PLATFORM,
      categorySlug: process.env.SPACES_TEST_CATEGORY_SLUG?.trim() || "demo-categoria",
      productName: process.env.SPACES_TEST_PRODUCT_NAME?.trim() || "produto-demo",
      productId: process.env.SPACES_TEST_PRODUCT_ID?.trim() || "test-local-001",
      prefix: folderPrefix,
      files: flat ? [keyTeste] : [keyTeste, keyMeta]
    },
    null,
    2
  );

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: keyTeste,
      Body: body,
      ContentType: "text/plain; charset=utf-8"
    })
  );

  if (!flat && keyMeta) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: keyMeta,
        Body: Buffer.from(metaJson, "utf8"),
        ContentType: "application/json; charset=utf-8"
      })
    );
  }

  // eslint-disable-next-line no-console
  console.log("Upload concluído.");
  // eslint-disable-next-line no-console
  console.log(`  modo:   ${flat ? "legado (ficheiro único)" : "árvore product-research / plataforma / categoria / produto__id"}`);
  // eslint-disable-next-line no-console
  console.log(`  bucket: ${bucket}`);
  // eslint-disable-next-line no-console
  console.log(`  pasta:  ${folderPrefix}/`);
  // eslint-disable-next-line no-console
  console.log(`  key:    ${keyTeste}`);
  if (!flat && keyMeta) {
    // eslint-disable-next-line no-console
    console.log(`  key:    ${keyMeta}`);
  }
  // eslint-disable-next-line no-console
  console.log(`  url:    ${publicObjectUrl({ bucket, region, key: keyTeste })}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(
    "Nota: a URL só abre sem login se o ficheiro (ou bucket) estiver público, ou usar URL assinada noutro passo."
  );
  // eslint-disable-next-line no-console
  console.log(
    "Dica: override SPACES_TEST_CATEGORY_SLUG, SPACES_TEST_PRODUCT_NAME, SPACES_TEST_PRODUCT_ID, SPACES_EXPORT_PLATFORM."
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
