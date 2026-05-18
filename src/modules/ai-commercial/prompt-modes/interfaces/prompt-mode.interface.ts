export type PromptVerbosity = "low" | "medium" | "high";
export type ProtectionLevel = "low" | "medium" | "high" | "maximum";
export type PreferredPromptStyle = "minimal_guidance" | "protective";

export interface PromptMode {
  name: string;
  description: string;
  verbosity: PromptVerbosity;
  semanticProtection: ProtectionLevel;
  geometryProtection: ProtectionLevel;
  motionProtection: ProtectionLevel;
  preferredPromptStyle: PreferredPromptStyle;
}
