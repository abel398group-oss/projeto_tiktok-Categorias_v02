/**
 * Teste: conexão DigitalOcean Spaces + PutObject (árvore de pastas acordada).
 *
 * Por defeito (sem SPACES_EXPORT_ROOT): tiktok-shop/{categoria}/{produto}__{id}/teste.txt (+ produto.json demo)
 * Com SPACES_OBJECTS_PUBLIC_READ=1 os URLs abrem no browser (ACL public-read nos objectos).
 *
 * Modo legado plano: EXPORT_SPACES_FLAT=1 → SPACES_BASE_PATH/teste.txt ou _smoke-test/teste.txt
 *
 * Uso: node --env-file=.env scripts/test-spaces-upload.mjs
 */
import { buildProductExportPrefix, DEFAULT_PLATFORM, resolvedExportRoot } from "./lib/spaces-export-paths.mjs";
import { createSpacesS3Client, putSpacesObject, spacesPutExtrasFromEnv } from "./lib/spaces-s3.mjs";

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
    keyTeste = prefix ? `${prefix}/teste.txt` : "_smoke-test/teste.txt";
    keyMeta = "";
    folderPrefix = prefix || "_smoke-test";
  } else {
    const categorySlug = process.env.SPACES_TEST_CATEGORY_SLUG?.trim() || "demo-categoria";
    const productName = process.env.SPACES_TEST_PRODUCT_NAME?.trim() || "produto-demo";
    const productId = process.env.SPACES_TEST_PRODUCT_ID?.trim() || "test-local-001";

    folderPrefix = buildProductExportPrefix({
      root: resolvedExportRoot(),
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
      root: resolvedExportRoot(),
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

  const client = createSpacesS3Client({ endpoint, region, accessKeyId, secretAccessKey });
  const acl = spacesPutExtrasFromEnv();

  await putSpacesObject(client, bucket, keyTeste, body, "text/plain; charset=utf-8", acl);

  if (!flat && keyMeta) {
    await putSpacesObject(
      client,
      bucket,
      keyMeta,
      Buffer.from(metaJson, "utf8"),
      "application/json; charset=utf-8",
      acl
    );
  }

  // eslint-disable-next-line no-console
  console.log("Upload concluído.");
  // eslint-disable-next-line no-console
  console.log(`  modo:   ${flat ? "legado (ficheiro único)" : "tiktok-shop / categoria / produto__id (opc. SPACES_EXPORT_ROOT)"}`);
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
    "URLs públicas só funcionam no browser se SPACES_OBJECTS_PUBLIC_READ=1 (ACL public-read) ou se gerar URL assinada."
  );
  // eslint-disable-next-line no-console
  console.log(
    "Dica: SPACES_TEST_CATEGORY_SLUG, SPACES_TEST_PRODUCT_NAME, SPACES_TEST_PRODUCT_ID, SPACES_EXPORT_PLATFORM."
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
