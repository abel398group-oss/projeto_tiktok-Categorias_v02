/**
 * ZIP com imagens (URLs TikTok CDN) para download no workspace — usado apenas na API analytics.
 */
import JSZip from "jszip";

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_MAX_BYTES =
  Number(process.env.WORKSPACE_IMAGE_ZIP_MAX_BYTES) > 0
    ? Number(process.env.WORKSPACE_IMAGE_ZIP_MAX_BYTES)
    : 15 * 1024 * 1024;

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

/**
 * @param {string} url
 * @param {number} maxBytes
 * @param {number} timeoutMs
 */
async function fetchImageBinary(url, maxBytes, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "tiktok-shop-workspace-images-zip/1.0 (analytics-api)" }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Ficheiro demasiado grande (> ${maxBytes} bytes)`);
    }
    return { buf, contentType: res.headers.get("content-type") || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string[]} urlsToDownload orden importa para nomes imagem-01, imagem-02…
 */
export async function buildImagesZipBuffer(urlsToDownload) {
  const timeoutMs =
    Number(process.env.WORKSPACE_IMAGE_ZIP_TIMEOUT_MS) > 0
      ? Number(process.env.WORKSPACE_IMAGE_ZIP_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  /** @type {string[]} */
  const failedLines = [];

  const zip = new JSZip();
  /** @type {number} */
  let added = 0;

  for (let i = 0; i < urlsToDownload.length; i++) {
    const url = urlsToDownload[i];
    try {
      const { buf, contentType } = await fetchImageBinary(url, DEFAULT_MAX_BYTES, timeoutMs);
      const ext = pickExtension(contentType, url);
      const slot = String(added + 1).padStart(2, "0");
      zip.file(`imagem-${slot}.${ext}`, buf);
      added += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failedLines.push(`${url} → ${msg}`);
    }
  }

  if (added === 0) {
    const err = new Error(
      failedLines.length
        ? `Nenhuma imagem foi descarregada.\n${failedLines.slice(0, 10).join("\n")}`
        : "Lista de URLs vazia."
    );
    throw err;
  }

  if (failedLines.length > 0) {
    zip.file("_falhas-download.txt", failedLines.join("\n\n"));
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  return { buffer, downloaded: added, failedCount: failedLines.length };
}
