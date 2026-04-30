/**
 * Cliente S3 mínimo para DigitalOcean Spaces (mesmas env que `test-spaces-upload.mjs`).
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * @param {{
 *   endpoint: string,
 *   region: string,
 *   accessKeyId: string,
 *   secretAccessKey: string,
 * }} cfg
 */
export function createSpacesS3Client(cfg) {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    },
    forcePathStyle: true
  });
}

/**
 * Leitura pública no URL (CDN/origin) — sem isto, objectos privados devolvem AccessDenied no browser.
 * Defina `SPACES_OBJECTS_PUBLIC_READ=1` no .env quando quiser abrir imagens/JSON pelo link.
 */
export function spacesPutExtrasFromEnv() {
  const v = process.env.SPACES_OBJECTS_PUBLIC_READ?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    return /** @type {const} */ ({ ACL: "public-read" });
  }
  return {};
}

/**
 * @param {InstanceType<typeof S3Client>} client
 * @param {Record<string, unknown>} [extra] ex. ACL (ver `spacesPutExtrasFromEnv`)
 */
export async function putSpacesObject(client, bucket, key, body, contentType, extra = {}) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...extra
    })
  );
}
