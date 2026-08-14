/**
 * image-utils.mjs — Funções puras de deduplicação e extração de URLs de imagem.
 * Sem dependências de outros módulos do projecto.
 */

/**
 * Identificador do asset OEC (mesmo ficheiro em p16/p19 ou em resoluções tplv distintas).
 * @param {string} u
 * @returns {string | null}
 */
export function getIbyteImageAssetId(u) {
  if (!u || typeof u !== "string") {
    return null;
  }
  try {
    const p = new URL(u.trim()).pathname;
    const m = p.match(/\/([a-f0-9]{8,32})~tplv-/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Mesmo ficheiro com crops diferentes (`:1000:1000` vs `:800:800`) — um URL por id de asset.
 * @param {string[]} urls
 * @returns {string[]}
 */
export function dedupeImageUrlsByAssetId(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string" || u.length < 12) {
      continue;
    }
    const t = u.trim();
    const id = getIbyteImageAssetId(t);
    const key = id != null ? `id:${id}` : t;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * O feed costuma listar o mesmo ficheiro em espelhos CDN (ex. `p16-oec-…` e `p19-oec-…` com o mesmo `pathname`).
 * Mantém a primeira ocorrência, ordem estável.
 * @param {string[]} urls
 * @returns {string[]}
 */
export function dedupeImageUrlsByPathname(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string" || u.length < 12) {
      continue;
    }
    const t = u.trim();
    if (!t.startsWith("http")) {
      continue;
    }
    let key;
    try {
      key = new URL(t).pathname;
    } catch {
      key = t;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Grelha (`fotos`) não repete o mesmo asset que já está em `fotos_pdp` (caminho diferente, mesmo hash).
 * @param {string[]|null|undefined} fotosGrelha
 * @param {string[]|null|undefined} fotosPdp
 * @returns {string[]|null}
 */
export function subtractFotosOverlappingPdp(fotosGrelha, fotosPdp) {
  if (!Array.isArray(fotosGrelha) || !fotosGrelha.length) {
    return null;
  }
  const g = dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(fotosGrelha));
  if (!Array.isArray(fotosPdp) || !fotosPdp.length) {
    return g.length ? g : null;
  }
  const pdpIds = new Set();
  for (const u of fotosPdp) {
    const id = getIbyteImageAssetId(u);
    if (id) {
      pdpIds.add(id);
    }
  }
  if (pdpIds.size === 0) {
    return g.length ? g : null;
  }
  const out = g.filter((u) => {
    const id = getIbyteImageAssetId(u);
    if (id && pdpIds.has(id)) {
      return false;
    }
    return true;
  });
  return out.length ? out : null;
}

/**
 * Deduplica URLs de imagem da galeria PDP (ordem estável, URL exata) e espelhos CDN por pathname.
 * @param {string[]} urls
 * @returns {string[]}
 */
export function dedupePdpImageUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const t = u.trim();
    if (t.length < 12) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(out));
}

/**
 * `shop_logo.url_list` traz o mesmo ficheiro em p16 e p19 (e por vezes resoluções tplv) — alinhar a `fotos`/`fotos_pdp`.
 * @param {string[]} urls
 * @returns {string[]}
 */
export function normalizeAndDedupeLogoUrlList(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    return [];
  }
  const abs = urls
    .filter((u) => typeof u === "string")
    .map((u) => {
      const t = u.trim();
      return t.startsWith("//") ? `https:${t}` : t;
    })
    .filter((u) => u.startsWith("http"));
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname(abs));
}

/**
 * Extrai URLs de imagem de produto a partir de campos conhecidos do feed OEC.
 * @param {object} p — produto já mergeado (mergeProductLayers)
 * @returns {string[]}
 */
export function extractImages(p) {
  const imgs = new Set();
  const pushUrl = (u) => {
    if (u == null || typeof u !== "string") return;
    let t = u.trim();
    if (t.startsWith("//")) t = `https:${t}`;
    if (t.startsWith("http")) imgs.add(t);
  };
  if (Array.isArray(p.images))
    p.images.forEach((x) => pushUrl(typeof x === "string" ? x : (x?.url ?? x?.uri ?? x?.pic_url ?? x?.thumb_url?.[0])));
  if (Array.isArray(p.image_list)) p.image_list.forEach((x) => pushUrl(typeof x === "string" ? x : (x?.url ?? x?.uri)));
  if (Array.isArray(p.product_image_list)) {
    for (const x of p.product_image_list) {
      pushUrl(typeof x === "string" ? x : x?.url ?? x?.thumb_url ?? x?.uri ?? x?.image?.url);
    }
  }
  if (Array.isArray(p.image?.url_list)) p.image.url_list.forEach(pushUrl);
  if (p.image?.url) pushUrl(p.image.url);
  if (p.cover_image?.url) pushUrl(p.cover_image.url);
  if (p.cover) pushUrl(typeof p.cover === "string" ? p.cover : p.cover?.url);
  if (p.main_image?.url) pushUrl(p.main_image.url);
  return dedupeImageUrlsByAssetId(dedupeImageUrlsByPathname([...imgs]));
}

/**
 * No sub-JSON dum produto PDP: apanha todos os HTTPS que pareçam foto de produto (estruturas OEC heterogéneas).
 * @param {unknown} node
 * @param {number} [maxDepth]
 * @param {number} [maxUrls]
 * @returns {string[]}
 */
export function extractHttpImageUrlsDeep(node, maxDepth = 14, maxUrls = 80) {
  const acc = [];
  const seen = new Set();
  (function walk(n, d) {
    if (d > maxDepth || n == null || acc.length >= maxUrls) return;
    if (typeof n === "string") {
      let t = n.trim();
      if (t.startsWith("//")) t = `https:${t}`;
      if (t.startsWith("http") && /p16-|p19-|ibyteimg|tiktokcdn\.com/i.test(t)) {
        if (!/\/(avt|sign\/)/i.test(t) && !/aweme-avt|user_?avatar|common-sign|user_nick/i.test(t)) {
          if (!seen.has(t)) {
            seen.add(t);
            acc.push(t);
          }
        }
      }
      return;
    }
    if (Array.isArray(n)) {
      for (const x of n) {
        walk(x, d + 1);
        if (acc.length >= maxUrls) return;
      }
      return;
    }
    if (typeof n !== "object") return;
    for (const v of Object.values(n)) {
      walk(v, d + 1);
      if (acc.length >= maxUrls) return;
    }
  })(node, 0);
  return acc;
}
