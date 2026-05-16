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

function uniqStrings(list: unknown[]): string[] {
  const seen = new Set();
  const out: string[] = [];
  for (const v of list) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function buildDefaults(): AiCommercial {
  const base: AiCommercial = {
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
    visualRules: { mustPreserve: [], mustAvoid: [...GLOBAL_MUST_AVOID] },
    primaryGeometryIdentity: undefined
  };
  return base;
}

function mergeAiCommercial(partial: Partial<AiCommercial> | undefined): AiCommercial {
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
    },
    primaryGeometryIdentity:
      partial?.primaryGeometryIdentity && typeof partial.primaryGeometryIdentity === "object"
        ? partial.primaryGeometryIdentity
        : base.primaryGeometryIdentity
  };
  merged.materials = uniqStrings(merged.materials);
  merged.surfaceFinish = uniqStrings(merged.surfaceFinish);
  merged.visualRules.mustPreserve = uniqStrings(merged.visualRules.mustPreserve);
  merged.visualRules.mustAvoid = uniqStrings([...GLOBAL_MUST_AVOID, ...merged.visualRules.mustAvoid]);
  return merged;
}

function applyIndustrialToolsOverrides(ai: AiCommercial): AiCommercial {
  if (ai.visualCategory !== "industrial_tools") return ai;

  if (ai.subcategory === "drill_bits") {
    const mustPreserve = [
      "exact_product_geometry",
      "spiral_flute_design_if_present_in_reference",
      "cutting_tips_if_present_in_reference",
      "hex_shank_shape_if_present_in_reference",
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
      "industrial device attached",
      "geometry reinterpretation",
      "hybrid tool geometry",
      "object redesign"
    ];

    return {
      ...ai,
      primaryGeometryIdentity: ai.primaryGeometryIdentity ?? {
        type: "drill_bit",
        mustNotMorphInto: ["sds_plus_chisel", "chisel_tool", "sds_plus_pointer", "rotary_tool_body"]
      },
      materials: uniqStrings([...ai.materials, "carbide", "hardened_steel"]),
      surfaceFinish: uniqStrings([...ai.surfaceFinish, "black_titanium_like_coating", "machined_metal"]),
      visualRules: {
        mustPreserve: uniqStrings([...ai.visualRules.mustPreserve, ...mustPreserve]),
        mustAvoid: uniqStrings([...GLOBAL_MUST_AVOID, ...ai.visualRules.mustAvoid, ...mustAvoidExtra])
      }
    };
  }

  if (ai.subcategory === "sds_plus_chisel") {
    const mustPreserve = [
      "exact_product_geometry",
      "sds_plus_shank_profile",
      "chisel_tip_profile",
      "non_spiral_body",
      "industrial_machined_look"
    ];
    const mustAvoidExtra = [
      "spiral drill geometry",
      "helical flutes",
      "threaded surfaces",
      "rotary structures",
      "secondary tool forms",
      "invented mechanical features",
      "geometry reinterpretation",
      "hybrid tool geometry",
      "object redesign"
    ];

    return {
      ...ai,
      primaryGeometryIdentity: ai.primaryGeometryIdentity ?? {
        type: "sds_plus_chisel",
        mustNotMorphInto: ["drill_bit", "spiral_flute_tool", "rotary_tool"]
      },
      materials: uniqStrings([...ai.materials, "hardened_steel"]),
      surfaceFinish: uniqStrings([...ai.surfaceFinish, "machined_metal"]),
      visualRules: {
        mustPreserve: uniqStrings([...ai.visualRules.mustPreserve, ...mustPreserve]),
        mustAvoid: uniqStrings([...GLOBAL_MUST_AVOID, ...ai.visualRules.mustAvoid, ...mustAvoidExtra])
      }
    };
  }

  return ai;
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
  build(metadata: ExportLocalMetadata): EnrichedMetadata {
    const partial = this.taxonomy.classify(metadata);
    const normalized = applyIndustrialToolsOverrides(mergeAiCommercial(partial));
    return { ...metadata, aiCommercial: normalized };
  }
}
