import type { TaxonomyRule } from "../interfaces/taxonomy-rule.interface";

const ELECTRONICS_KEYWORDS = ["electronics", "eletrônico", "eletronico", "usb", "bluetooth", "wireless", "charger", "carregador"];

function hasAnyKeyword(text, keywords) {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export const ELECTRONICS_RULES: TaxonomyRule[] = [
  {
    id: "electronics:base:v1",
    visualCategory: "electronics",
    match: (ctx) => hasAnyKeyword(ctx.text, ELECTRONICS_KEYWORDS),
    build: () => ({
      visualCategory: "electronics",
      subcategory: "electronics",
      cinematicProfile: {
        style: "premium_tech_showcase",
        camera: "unknown",
        lighting: "dark_futuristic_reflections"
      },
      visualRules: {
        mustPreserve: [],
        mustAvoid: []
      }
    })
  }
];

