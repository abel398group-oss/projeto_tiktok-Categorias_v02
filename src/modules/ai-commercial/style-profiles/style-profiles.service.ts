import type { ProductUnderstandingResult } from "../product-understanding/interfaces/product-understanding-result.interface";
import type { StyleProfile } from "./interfaces/style-profile.interface";
import type { StyleProfileResult } from "./interfaces/style-profile-result.interface";

const PROFILES: StyleProfile[] = [
  {
    name: "premium_product_motion_photography",
    description: "Premium product photography with subtle camera-only motion and maximum fidelity priority.",
    visualLanguage: "premium product photography with subtle motion",
    background: "clean white infinite studio",
    lighting: "soft high-key diffused lighting",
    cameraMotion: "micro controlled camera movement, slow macro push-in, subtle parallax",
    objectMotion: "none",
    reflectionStyle: "controlled soft realistic reflections",
    editingStyle: "minimal luxury product reveal",
    motionComplexity: "low",
    environmentComplexity: "minimal",
    semanticComplexity: "low",
    fidelityPriority: "maximum"
  },
  {
    name: "industrial_luxury_studio",
    description: "Premium industrial product showcase with cinematic camera motion and controlled reflections.",
    visualLanguage: "premium industrial product showcase",
    background: "neutral dark-to-gray studio surface",
    lighting: "controlled studio reflections with mild contrast",
    cameraMotion: "slow cinematic orbit and macro push-in",
    objectMotion: "none",
    reflectionStyle: "premium metallic reflections",
    editingStyle: "slow cinematic product reveal",
    motionComplexity: "medium",
    environmentComplexity: "low",
    semanticComplexity: "medium",
    fidelityPriority: "high"
  },
  {
    name: "clean_catalog_motion",
    description: "Clean e-commerce catalog motion with low complexity and high fidelity.",
    visualLanguage: "clean e-commerce product motion",
    background: "neutral light gray studio",
    lighting: "even soft studio lighting",
    cameraMotion: "simple front push-in and slight parallax",
    objectMotion: "none",
    reflectionStyle: "natural product reflections",
    editingStyle: "catalog-style product showcase",
    motionComplexity: "low",
    environmentComplexity: "minimal",
    semanticComplexity: "low",
    fidelityPriority: "high"
  }
];

function normalizeName(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export class StyleProfilesService {
  selectProfile(input: { productUnderstanding: ProductUnderstandingResult; preferredStyle?: string }): StyleProfileResult {
    const warnings: string[] = [];
    const preferred = normalizeName(input?.preferredStyle);

    if (preferred) {
      const found = PROFILES.find((p) => normalizeName(p.name) === preferred);
      if (found) {
        return {
          selectedProfile: found,
          reason: `preferredStyle matched '${found.name}'`,
          warnings
        };
      }
      warnings.push(`preferredStyle '${input.preferredStyle}' not found; falling back to selection rules`);
    }

    const risk = input?.productUnderstanding?.semanticRiskProfile?.riskLevel || "medium";

    if (risk === "extreme") {
      const selected = PROFILES.find((p) => p.name === "premium_product_motion_photography") ?? PROFILES[0];
      return {
        selectedProfile: selected,
        reason: "riskLevel is extreme; forcing premium_product_motion_photography",
        warnings
      };
    }

    const selected = PROFILES.find((p) => p.name === "clean_catalog_motion") ?? PROFILES[0];
    return {
      selectedProfile: selected,
      reason: "default selection rule; using clean_catalog_motion",
      warnings
    };
  }
}
