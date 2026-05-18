export type MotionComplexity = "low" | "medium" | "high";
export type EnvironmentComplexity = "minimal" | "low" | "medium" | "high";
export type SemanticComplexity = "low" | "medium" | "high";
export type FidelityPriority = "maximum" | "high" | "medium" | "low";

export interface StyleProfile {
  name: string;
  description: string;
  visualLanguage: string;
  background: string;
  lighting: string;
  cameraMotion: string;
  objectMotion: string;
  reflectionStyle: string;
  editingStyle: string;
  motionComplexity: MotionComplexity;
  environmentComplexity: EnvironmentComplexity;
  semanticComplexity: SemanticComplexity;
  fidelityPriority: FidelityPriority;
}
