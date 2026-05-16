import type { TaxonomyRule } from "../interfaces/taxonomy-rule.interface";

const FASHION_KEYWORDS = ["fashion", "moda", "roupa", "vestido", "camisa", "calça", "calca", "sutiã", "sutia", "lingerie"];

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export const FASHION_RULES: TaxonomyRule[] = [
  {
    id: "fashion:base:v1",
    visualCategory: "fashion",
    match: (ctx) => hasAnyKeyword(ctx.text, FASHION_KEYWORDS),
    build: () => ({
      visualCategory: "fashion",
      subcategory: "fashion",
      cinematicProfile: {
        style: "editorial_fashion_motion",
        camera: "unknown",
        lighting: "soft_editorial_studio",
        cameraMotion: { type: "camera_orbit_showcase", intensity: "slow", style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"] }
      },
      visualRules: {
        mustPreserve: [],
        mustAvoid: []
      }
    })
  }
];
