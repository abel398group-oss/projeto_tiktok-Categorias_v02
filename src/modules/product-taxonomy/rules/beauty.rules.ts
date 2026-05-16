import type { TaxonomyRule } from "../interfaces/taxonomy-rule.interface";

const BEAUTY_KEYWORDS = ["beauty", "skincare", "maquiagem", "makeup", "cosmetic", "cosmético", "perfume"];

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export const BEAUTY_RULES: TaxonomyRule[] = [
  {
    id: "beauty:base:v1",
    visualCategory: "beauty",
    match: (ctx) => hasAnyKeyword(ctx.text, BEAUTY_KEYWORDS),
    build: () => ({
      visualCategory: "beauty",
      subcategory: "beauty",
      cinematicProfile: {
        style: "luxury_beauty_soft_reflections",
        camera: "unknown",
        lighting: "warm_soft_premium_studio",
        cameraMotion: { type: "camera_orbit_showcase", intensity: "slow", style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"] }
      },
      visualRules: {
        mustPreserve: [],
        mustAvoid: []
      }
    })
  }
];

