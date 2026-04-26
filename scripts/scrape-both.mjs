/**
 * Corrida sequencial: duas categorias, outputs em pastas distintas (só orquestra o CLI, sem tocar no parser).
 * Uso: node scripts/scrape-both.mjs
 * Variáveis do processo pai (ex.: PDP_GALLERY=1 do `npm run coleta:completa`) propagam em `...process.env` a cada `spawn`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const script = path.join(root, "src", "scrapeCategory.mjs");

const Q =
  "source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";

const runs = [
  {
    label: "Womenswear & Underwear (nível 1)",
    OUTPUT_DIR: path.join("output", "categorias", "womenswear-underwear"),
    CATEGORY_URL: `https://shop.tiktok.com/br/c/womenswear-underwear/601152?${Q}`
  },
  {
    label: "Roupa íntima feminina / Women's Underwear (sub, taxonomia 842888)",
    OUTPUT_DIR: path.join("output", "categorias", "roupas-intimas-femininas"),
    CATEGORY_URL: `https://shop.tiktok.com/br/c/women-s-underwear/842888?${Q}`
  }
];

for (const r of runs) {
  // eslint-disable-next-line no-console
  console.log(`\n--- ${r.label} ---\nOUTPUT_DIR=${r.OUTPUT_DIR}\nCATEGORY_URL=${r.CATEGORY_URL}\n`);
  const res = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, OUTPUT_DIR: r.OUTPUT_DIR, CATEGORY_URL: r.CATEGORY_URL },
    stdio: "inherit"
  });
  if (res.status !== 0 && res.status != null) {
    process.exit(res.status);
  }
}
