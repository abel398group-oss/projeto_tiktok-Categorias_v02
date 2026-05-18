export interface SemanticPromptStrategy {
  safeProductDescription: string;
  forbiddenSemanticTerms: string[];
  semanticReplacementTerms: string[];
  interpretationInstruction: string;
}
