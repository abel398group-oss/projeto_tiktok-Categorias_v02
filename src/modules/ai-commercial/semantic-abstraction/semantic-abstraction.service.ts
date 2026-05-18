import type { ProductUnderstandingResult } from "../product-understanding/interfaces/product-understanding-result.interface";
import type { SemanticRiskLevel } from "../product-understanding/interfaces/semantic-risk-profile.interface";
import type { StyleProfileResult } from "../style-profiles/interfaces/style-profile-result.interface";
import type { AbstractionLevel, SemanticAbstractionResult } from "./interfaces/semantic-abstraction-result.interface";

function normalizeTerm(v: unknown): string {
  const s = typeof v === "string" ? v : v != null ? String(v) : "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSpaces(v: unknown): string {
  return String(v ?? "")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = normalizeTerm(raw);
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mapRiskToAbstractionLevel(risk: SemanticRiskLevel): AbstractionLevel {
  if (risk === "extreme") return "high";
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  return "low";
}

function applyAbstractionMappings(term: string): string {
  const t = normalizeTerm(term);
  if (!t) return "";

  const exact: Record<string, string> = {
    demolition_tool: "premium metallic product object",
    industrial_tool: "precision metallic geometry",
    industrial_tools: "precision metallic geometry",
    steel_form: "premium reflective metallic surface",
    hammer_drill_accessory: "luxury machined product component",
    sds_plus_chisel: "precision elongated metallic product"
  };

  if (exact[t]) return exact[t];

  const patterns: Array<[RegExp, string]> = [
    [/\bdemolition tool\b/gi, "premium metallic product object"],
    [/\bindustrial tool\b/gi, "precision metallic geometry"],
    [/\bhammer drill accessory\b/gi, "luxury machined product component"],
    [/\bindustrial\s+steel\s+form\b/gi, "premium reflective metallic surface"],
    [/\bsteel form\b/gi, "premium reflective metallic surface"],
    [/\btool\b/gi, "object"],
    [/\bdemolition\b/gi, "premium"],
    [/\bindustrial\b/gi, "premium"],
    [/\bsteel\b/gi, "metallic"]
  ];

  let out = term;
  for (const [re, repl] of patterns) out = out.replace(re, repl);
  const cleaned = normalizeSpaces(out)
    .replace(/\bpremium\s+premium\b/gi, "premium")
    .replace(/\bmetallic\s+metallic\b/gi, "metallic")
    .trim();
  return normalizeTerm(cleaned);
}

function buildOriginalTerms(pu: ProductUnderstandingResult): string[] {
  const id = pu?.productIdentity;
  const geo = pu?.geometryProfile;
  const semantic = pu?.semanticRiskProfile;

  const base = [
    id?.objectType ?? "",
    id?.visualClass ?? "",
    id?.category ?? "",
    id?.subcategory ?? "",
    id?.materialFamily ?? "",
    id?.surfaceFinish ?? "",
    id?.rigidity ?? "",
    id?.semanticAlias ?? "",
    geo?.geometryFamily ?? "",
    geo?.shapeDescription ?? "",
    ...(Array.isArray(semantic?.dangerousTerms) ? semantic.dangerousTerms : []),
    ...(Array.isArray(semantic?.forbiddenBehaviors) ? semantic.forbiddenBehaviors : []),
    ...(Array.isArray(semantic?.safeSemanticReplacement) ? semantic.safeSemanticReplacement : [])
  ];

  return uniqKeepOrder(base);
}

function buildDangerousTerms(pu: ProductUnderstandingResult): string[] {
  const semantic = pu?.semanticRiskProfile;
  return uniqKeepOrder([
    ...(Array.isArray(semantic?.dangerousTerms) ? semantic.dangerousTerms : []),
    ...(Array.isArray(semantic?.forbiddenBehaviors) ? semantic.forbiddenBehaviors : [])
  ]);
}

function buildAbstractedTerms(args: {
  productUnderstanding: ProductUnderstandingResult;
  abstractionLevel: AbstractionLevel;
}): string[] {
  const pu = args.productUnderstanding;
  const id = pu?.productIdentity;
  const geo = pu?.geometryProfile;
  const semantic = pu?.semanticRiskProfile;

  const preserveGeometry = [
    geo?.shapeDescription ? applyAbstractionMappings(geo.shapeDescription) : "",
    geo?.geometryFamily ? normalizeTerm(geo.geometryFamily) : ""
  ].filter(Boolean);

  const identityMapped = [
    id?.visualClass ? applyAbstractionMappings(id.visualClass) : "",
    id?.category ? applyAbstractionMappings(id.category) : "",
    id?.objectType ? applyAbstractionMappings(id.objectType) : ""
  ].filter(Boolean);

  const safeReplacements = Array.isArray(semantic?.safeSemanticReplacement)
    ? semantic.safeSemanticReplacement.map((t) => applyAbstractionMappings(t))
    : [];

  const core = uniqKeepOrder([...identityMapped, ...safeReplacements, ...preserveGeometry]);

  if (args.abstractionLevel === "low") return core;
  if (args.abstractionLevel === "medium") return uniqKeepOrder([...core, "premium photographed studio product"]);
  return uniqKeepOrder([
    ...core,
    "premium product motion photography",
    "luxury machined product",
    "premium reflective metallic surface",
    "precision metallic geometry"
  ]);
}

export class SemanticAbstractionService {
  abstract(input: {
    productUnderstanding: ProductUnderstandingResult;
    styleProfileResult?: StyleProfileResult;
  }): SemanticAbstractionResult {
    const risk = input?.productUnderstanding?.semanticRiskProfile?.riskLevel || "medium";
    const abstractionLevel = mapRiskToAbstractionLevel(risk);

    const originalTerms = buildOriginalTerms(input.productUnderstanding);
    const dangerousTerms = buildDangerousTerms(input.productUnderstanding);
    const abstractedTerms = buildAbstractedTerms({ productUnderstanding: input.productUnderstanding, abstractionLevel });

    const styleName = input?.styleProfileResult?.selectedProfile?.name ?? null;
    const abstractionReason = [
      `riskLevel=${risk} -> abstractionLevel=${abstractionLevel}`,
      styleName ? `styleProfile=${styleName}` : "styleProfile=none",
      "reduced operational/functional semantics while preserving geometry identity"
    ].join("; ");

    return {
      originalTerms,
      dangerousTerms,
      abstractedTerms,
      abstractionLevel,
      abstractionReason
    };
  }
}
