import type { TaxonomyRule } from "../interfaces/taxonomy-rule.interface";

const ELECTRONICS_KEYWORDS = ["electronics", "eletrônico", "eletronico", "usb", "bluetooth", "wireless", "charger", "carregador"];

function hasAnyKeyword(text: string, keywords: string[]): boolean {
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
        lighting: "dark_futuristic_reflections",
        cameraMotion: { type: "camera_orbit_showcase", intensity: "slow", style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"] }
      },
      visualRules: {
        mustPreserve: [],
        mustAvoid: []
      }
    })
  }
];
