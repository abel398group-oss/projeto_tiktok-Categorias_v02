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

const SDS_PLUS_CHISEL_KEYWORDS = ["sds", "sds plus", "ponteiro", "talhadeira", "cinzel", "chisel"];

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export const INDUSTRIAL_TOOLS_RULES: TaxonomyRule[] = [
  {
    id: "industrial_tools:sds_plus_chisel:v1",
    visualCategory: "industrial_tools",
    match: (ctx) => hasAnyKeyword(ctx.text, SDS_PLUS_CHISEL_KEYWORDS),
    build: () => ({
      visualCategory: "industrial_tools",
      subcategory: "sds_plus_chisel",
      primaryGeometryIdentity: {
        type: "sds_plus_chisel",
        mustNotMorphInto: ["drill_bit", "spiral_flute_tool", "rotary_tool"]
      },
      cinematicProfile: {
        style: "luxury_industrial_macro",
        camera: "slow_push_in",
        lighting: "dark_premium_studio",
        cameraMotion: {
          type: "camera_orbit_showcase",
          intensity: "slow",
          style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"]
        }
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
  },
  {
    id: "industrial_tools:drill_bits:v1",
    visualCategory: "industrial_tools",
    match: (ctx) => hasAnyKeyword(ctx.text, INDUSTRIAL_TOOL_KEYWORDS),
    build: () => ({
      visualCategory: "industrial_tools",
      subcategory: "drill_bits",
      primaryGeometryIdentity: {
        type: "drill_bit",
        mustNotMorphInto: ["sds_plus_chisel", "chisel_tool", "sds_plus_pointer", "rotary_tool_body"]
      },
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
