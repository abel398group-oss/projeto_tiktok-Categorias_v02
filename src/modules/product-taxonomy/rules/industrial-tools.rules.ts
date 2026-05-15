import type { TaxonomyRule } from "../interfaces/taxonomy-rule.interface";

const INDUSTRIAL_TOOL_KEYWORDS = [
  "broca",
  "brocas",
  "drill",
  "carbide",
  "titanium",
  "tool",
  "tools",
  "industrial"
];

function hasAnyKeyword(text, keywords) {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export const INDUSTRIAL_TOOLS_RULES: TaxonomyRule[] = [
  {
    id: "industrial_tools:drill_bits:v1",
    visualCategory: "industrial_tools",
    match: (ctx) => hasAnyKeyword(ctx.text, INDUSTRIAL_TOOL_KEYWORDS),
    build: () => ({
      visualCategory: "industrial_tools",
      subcategory: "drill_bits",
      cinematicProfile: {
        style: "luxury_industrial_macro",
        camera: "slow_push_in",
        lighting: "dark_premium_studio",
        cameraMotion: { type: "camera_orbit_showcase", intensity: "slow", style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"] }
      },
      physicsProfile: {
        rigidity: "extreme",
        allowedMotion: "camera_only",
        deformationAllowed: false
      },
      visualRules: {
        mustPreserve: [],
        mustAvoid: []
      }
    })
  }
];
