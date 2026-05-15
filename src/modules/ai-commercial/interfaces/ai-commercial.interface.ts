import type { CinematicProfile } from "./cinematic-profile.interface";
import type { PhysicsProfile } from "./physics-profile.interface";
import type { VisualRules } from "./visual-rules.interface";

export type VisualCategory = "industrial_tools" | "beauty" | "electronics" | "fashion" | "unknown";

export interface AiCommercial {
  visualCategory: VisualCategory;
  subcategory: string;
  materials: string[];
  surfaceFinish: string[];
  physicsProfile: PhysicsProfile;
  cinematicProfile: CinematicProfile;
  visualRules: VisualRules;
}

export interface AiCommercialEnvelope {
  aiCommercial: AiCommercial;
}

