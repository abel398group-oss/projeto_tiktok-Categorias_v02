/**
 * Em desenvolvimento: `API_URL` vazio → pedidos ao mesmo host do Vite; o proxy reencaminha para 127.0.0.1:3333.
 * Override: `VITE_API_URL=http://127.0.0.1:3333` no `.env` do frontend (exige CORS na API).
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Troque ou defina `VITE_ANALYTICS_API_KEY` no `.env` do frontend (deve coincidir com a API). */
export const API_KEY = import.meta.env.VITE_ANALYTICS_API_KEY ?? "uma-chave-local";

/**
 * @param {string} path ex.: "/analytics/top-products"
 */
export async function apiFetch(path) {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`
    }
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || `Resposta inválida (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return body;
}

/**
 * POST JSON com a mesma autenticação que {@link apiFetch}.
 * @param {string} path ex.: "/analytics/export-product-to-spaces"
 * @param {Record<string, unknown>} body
 */
export async function apiPost(path, body) {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body ?? {})
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || `Resposta inválida (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return parsed;
}

/**
 * POST que devolve ficheiro binário (ZIP) com Bearer; para download no browser via Blob.
 * @param {string} path caminho sob o proxy (ex.: `/analytics/product-workspace/123/images-zip`)
 * @param {Record<string, unknown>} body
 */
export async function apiPostBlob(path, body) {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body ?? {})
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return res.blob();
}
