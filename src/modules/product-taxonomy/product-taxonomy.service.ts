import type { AiCommercial } from "../ai-commercial/interfaces/ai-commercial.interface";
import type { ExportLocalMetadata } from "../ai-commercial/interfaces/enriched-metadata.interface";
import type { TaxonomyRule } from "./interfaces/taxonomy-rule.interface";
import { BEAUTY_RULES } from "./rules/beauty.rules";
import { ELECTRONICS_RULES } from "./rules/electronics.rules";
import { FASHION_RULES } from "./rules/fashion.rules";
import { INDUSTRIAL_TOOLS_RULES } from "./rules/industrial-tools.rules";

function safeText(v) {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function normalizeText(s) {
  return safeText(s)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

function extractMetadataText(metadata) {
  const nome = normalizeText(metadata?.nome);
  const categoria = normalizeText(metadata?.categoria);
  const desc =
    normalizeText(metadata?.description) ||
    normalizeText(metadata?.content?.description) ||
    normalizeText(metadata?.product?.description);
  return [nome, categoria, desc].filter((x) => x !== "").join("\n");
}

export class ProductTaxonomyService {
  /** @type {TaxonomyRule[]} */
  rules;

  constructor(rules = [...INDUSTRIAL_TOOLS_RULES, ...BEAUTY_RULES, ...ELECTRONICS_RULES, ...FASHION_RULES]) {
    this.rules = rules;
  }

  /**
   * Classifica metadata e retorna um AiCommercial base (parcial).
   * @param {ExportLocalMetadata} metadata
   * @returns {Partial<AiCommercial>}
   */
  classify(metadata) {
    const text = extractMetadataText(metadata);
    for (const rule of this.rules) {
      if (rule.match({ metadata, text })) {
        return rule.build({ metadata, text });
      }
    }
    return {
      visualCategory: "unknown",
      subcategory: "unknown",
      materials: [],
      surfaceFinish: [],
      cinematicProfile: { style: "unknown", camera: "unknown", lighting: "unknown" },
      physicsProfile: { rigidity: "unknown", allowedMotion: "unknown", deformationAllowed: false },
      visualRules: { mustPreserve: [], mustAvoid: [] }
    };
  }
}

