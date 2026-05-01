/**
 * Duas categorias no mesmo Chrome (sessão/perfil mantidos); outputs em pastas distintas.
 * Uso: node scripts/scrape-both.mjs
 * Variáveis do processo pai (ex.: PDP_GALLERY=1) propagam em `process.env` na importação.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeCategoriesSequentialSharedBrowser } from "../src/scrapeCategory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const Q =
  "source=ecommerce_sitemap&enter_method=category_directory&first_entrance=ecommerce_category&first_entrance_position=bread_crumbs&first_entrance_tt_scene=seo";

const runs = [
  {
    label: "Womenswear & Underwear (nível 1)",
    OUTPUT_DIR: path.join(root, "output", "categorias", "womenswear-underwear"),
    CATEGORY_URL: `https://shop.tiktok.com/br/c/womenswear-underwear/601152?${Q}`
  },
  {
    label: "Roupa íntima feminina / Women's Underwear (sub, taxonomia 842888)",
    OUTPUT_DIR: path.join(root, "output", "categorias", "roupas-intimas-femininas"),
    CATEGORY_URL: `https://shop.tiktok.com/br/c/women-s-underwear/842888?${Q}`
  }
];

await scrapeCategoriesSequentialSharedBrowser(runs).catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
