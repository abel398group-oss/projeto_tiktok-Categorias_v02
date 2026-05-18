import type { ProductUnderstandingResult } from "../product-understanding/interfaces/product-understanding-result.interface";
import type { PromptMode } from "./interfaces/prompt-mode.interface";
import type { PromptModeResult } from "./interfaces/prompt-mode-result.interface";

const MODES: PromptMode[] = [
  {
    name: "runway-mode",
    description: "Short, guiding, photography-first prompt that leverages Runway priors.",
    verbosity: "low",
    semanticProtection: "medium",
    geometryProtection: "medium",
    motionProtection: "medium",
    preferredPromptStyle: "minimal_guidance"
  },
  {
    name: "protective-mode",
    description: "Protective prompt with maximum geometry, semantic, and motion protection for unstable models.",
    verbosity: "high",
    semanticProtection: "maximum",
    geometryProtection: "maximum",
    motionProtection: "maximum",
    preferredPromptStyle: "protective"
  }
];

function normalizeName(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export class PromptModesService {
  selectMode(input: { productUnderstanding: ProductUnderstandingResult; preferredMode?: string }): PromptModeResult {
    const warnings: string[] = [];
    const preferred = normalizeName(input?.preferredMode);

    if (preferred) {
      const found = MODES.find((m) => normalizeName(m.name) === preferred);
      if (found) {
        return {
          selectedMode: found,
          reason: `preferredMode matched '${found.name}'`,
          warnings
        };
      }
      warnings.push(`preferredMode '${input.preferredMode}' not found; falling back to selection rules`);
    }

    const risk = input?.productUnderstanding?.semanticRiskProfile?.riskLevel || "medium";

    if (risk === "extreme") {
      const selected = MODES.find((m) => m.name === "protective-mode") ?? MODES[0];
      return {
        selectedMode: selected,
        reason: "riskLevel is extreme; defaulting to protective-mode",
        warnings
      };
    }

    const selected = MODES.find((m) => m.name === "runway-mode") ?? MODES[0];
    return {
      selectedMode: selected,
      reason: "default selection rule; using runway-mode",
      warnings
    };
  }
}
