/**
 * Extrai lista ordenada de URLs HTTP a partir dos campos JSON `images` / `pdpImages` do snapshot.
 * PDP primeiro (maior riqueza), depois grelha, sem duplicados.
 */

/**
 * @param {unknown} block
 */
function collectFromBlock(block, /** @type {string[]} */ out) {
  if (block == null) return;
  if (typeof block === "string" && block.startsWith("http")) {
    out.push(block.trim());
    return;
  }
  if (!Array.isArray(block)) return;
  for (const x of block) {
    if (typeof x === "string" && x.startsWith("http")) {
      out.push(x.trim());
    } else if (x && typeof x === "object" && typeof (/** @type {Record<string, unknown>} */ (x)).url === "string") {
      const u = String((/** @type {{ url: string }} */ (x)).url).trim();
      if (u.startsWith("http")) out.push(u);
    }
  }
}

/**
 * @param {{ pdpImages?: unknown, images?: unknown }} snapshot
 */
export function extractOrderedImageUrls(snapshot) {
  const raw = [];
  collectFromBlock(snapshot?.pdpImages, raw);
  collectFromBlock(snapshot?.images, raw);
  const seen = new Set();
  const deduped = [];
  for (const u of raw) {
    if (seen.has(u)) continue;
    seen.add(u);
    deduped.push(u);
  }
  return deduped;
}

export function countHttpPdpImages(snapshot) {
  const out = [];
  collectFromBlock(snapshot?.pdpImages, out);
  const seen = new Set();
  let c = 0;
  for (const u of out) {
    const t = typeof u === "string" ? u.trim() : "";
    if (!t.startsWith("http")) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    c++;
  }
  return c;
}

export function hasAtLeastHttpPdpImages(snapshot, minCount = 3) {
  const n = typeof minCount === "number" && Number.isFinite(minCount) ? Math.max(1, Math.floor(minCount)) : 3;
  return countHttpPdpImages(snapshot) >= n;
}
