import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";
import type { EnrichedMetadata, ExportLocalMetadata } from "../../ai-commercial/interfaces/enriched-metadata.interface";
import type { CommercialContextBuilder } from "../interfaces/commercial-context-builder.interface";
import { ProductTaxonomyService } from "../../product-taxonomy/product-taxonomy.service";

const GLOBAL_MUST_AVOID = [
  "humans",
  "hands",
  "morphing",
  "deformation",
  "rotating product",
  "spinning object",
  "floating product",
  "animated product",
  "broken geometry",
  "low quality textures",
  "text artifacts"
];

function uniqStrings(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function buildDefaults() {
  /** @type {AiCommercial} */
  const base = {
    visualCategory: "unknown",
    subcategory: "unknown",
    materials: [],
    surfaceFinish: [],
    physicsProfile: {
      rigidity: "unknown",
      allowedMotion: "camera_only",
      deformationAllowed: false
    },
    cinematicProfile: {
      style: "unknown",
      camera: "unknown",
      lighting: "unknown",
      cameraMotion: { type: "camera_orbit_showcase", intensity: "slow", style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"] }
    },
    visualRules: { mustPreserve: [], mustAvoid: [...GLOBAL_MUST_AVOID] }
  };
  return base;
}

function mergeAiCommercial(partial) {
  const base = buildDefaults();
  /** @type {AiCommercial} */
  const merged = {
    visualCategory: partial?.visualCategory ?? base.visualCategory,
    subcategory: partial?.subcategory ?? base.subcategory,
    materials: Array.isArray(partial?.materials) ? partial.materials : base.materials,
    surfaceFinish: Array.isArray(partial?.surfaceFinish) ? partial.surfaceFinish : base.surfaceFinish,
    physicsProfile: {
      rigidity: partial?.physicsProfile?.rigidity ?? base.physicsProfile.rigidity,
      allowedMotion: partial?.physicsProfile?.allowedMotion ?? base.physicsProfile.allowedMotion,
      deformationAllowed:
        typeof partial?.physicsProfile?.deformationAllowed === "boolean"
          ? partial.physicsProfile.deformationAllowed
          : base.physicsProfile.deformationAllowed
    },
    cinematicProfile: {
      style: partial?.cinematicProfile?.style ?? base.cinematicProfile.style,
      camera: partial?.cinematicProfile?.camera ?? base.cinematicProfile.camera,
      lighting: partial?.cinematicProfile?.lighting ?? base.cinematicProfile.lighting,
      cameraMotion: {
        type: partial?.cinematicProfile?.cameraMotion?.type ?? base.cinematicProfile.cameraMotion.type,
        intensity: partial?.cinematicProfile?.cameraMotion?.intensity ?? base.cinematicProfile.cameraMotion.intensity,
        style: Array.isArray(partial?.cinematicProfile?.cameraMotion?.style)
          ? partial.cinematicProfile.cameraMotion.style
          : base.cinematicProfile.cameraMotion.style
      }
    },
    visualRules: {
      mustPreserve: Array.isArray(partial?.visualRules?.mustPreserve) ? partial.visualRules.mustPreserve : base.visualRules.mustPreserve,
      mustAvoid: Array.isArray(partial?.visualRules?.mustAvoid) ? partial.visualRules.mustAvoid : base.visualRules.mustAvoid
    }
  };
  merged.materials = uniqStrings(merged.materials);
  merged.surfaceFinish = uniqStrings(merged.surfaceFinish);
  merged.visualRules.mustPreserve = uniqStrings(merged.visualRules.mustPreserve);
  merged.visualRules.mustAvoid = uniqStrings([...GLOBAL_MUST_AVOID, ...merged.visualRules.mustAvoid]);
  return merged;
}

function applyIndustrialToolsOverrides(ai) {
  if (ai.visualCategory !== "industrial_tools" || ai.subcategory !== "drill_bits") return ai;

  const mustPreserve = [
    "exact_product_geometry",
    "sharp_cutting_tips",
    "spiral_flute_design",
    "hex_shank_shape",
    "metallic_reflections"
  ];
  const mustAvoidExtra = [
    "drilling action",
    "cutting action",
    "sparks",
    "penetration",
    "unrealistic physics",
    "drill machine",
    "grinder",
    "rotary tool",
    "power tool body",
    "chuck",
    "mandrel",
    "industrial device attached"
  ];

  return {
    ...ai,
    materials: uniqStrings([...ai.materials, "carbide", "hardened_steel"]),
    surfaceFinish: uniqStrings([...ai.surfaceFinish, "black_titanium_like_coating", "machined_metal"]),
    visualRules: {
      mustPreserve: uniqStrings([...ai.visualRules.mustPreserve, ...mustPreserve]),
      mustAvoid: uniqStrings([...GLOBAL_MUST_AVOID, ...ai.visualRules.mustAvoid, ...mustAvoidExtra])
    }
  };
}

export class CommercialContextBuilderImpl implements CommercialContextBuilder {
  /** @type {ProductTaxonomyService} */
  taxonomy;

  constructor(taxonomy = new ProductTaxonomyService()) {
    this.taxonomy = taxonomy;
  }

  /**
   * @param {ExportLocalMetadata} metadata
   * @returns {EnrichedMetadata}
   */
  build(metadata) {
    const partial = this.taxonomy.classify(metadata);
    const normalized = applyIndustrialToolsOverrides(mergeAiCommercial(partial));
    return { ...metadata, aiCommercial: normalized };
  }
}
