export type AbstractionLevel = "low" | "medium" | "high" | "extreme";

export interface SemanticAbstractionResult {
  originalTerms: string[];
  dangerousTerms: string[];
  abstractedTerms: string[];
  abstractionLevel: AbstractionLevel;
  abstractionReason: string;
}
