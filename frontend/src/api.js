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
 * @param {string} path ex.: "/analytics/import-output"
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

/**
 * PUT JSON com a mesma autenticação que {@link apiFetch}.
 *
 * Existe por causa dos cortes do motor de score: são os únicos valores do
 * painel que se gravam no SERVIDOR, e não no navegador de quem os mexe.
 *
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
export async function apiPut(path, body) {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;

  const res = await fetch(`${base}${p}`, {
    method: "PUT",
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
    /* A validação do servidor devolve `erros` — uma lista, e cada linha diz
       qual corte e porquê. Achatar para uma frase só perderia isso, e o
       utilizador ficava a saber que falhou sem saber onde. */
    const lista = Array.isArray(parsed?.erros) ? parsed.erros.join(" · ") : null;
    const msg = lista || parsed?.message || parsed?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return parsed;
}

/**
 * DELETE com a mesma autenticação. Usado para «voltar ao padrão»: apagar a
 * linha, e não gravar por cima o valor do catálogo.
 *
 * @param {string} path
 */
export async function apiDelete(path) {
  const base = API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;

  const res = await fetch(`${base}${p}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_KEY}` }
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
