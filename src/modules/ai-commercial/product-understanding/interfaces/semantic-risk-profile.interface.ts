export type SemanticRiskLevel = "low" | "medium" | "high" | "extreme";

export interface SemanticRiskProfile {
  riskLevel: SemanticRiskLevel;
  dangerousTerms: string[];
  forbiddenBehaviors: string[];
  safeSemanticReplacement: string[];
}
