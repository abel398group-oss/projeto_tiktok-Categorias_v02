import type { CinematicPromptStrategy } from "./cinematic-prompt-strategy.interface";
import type { GeometryLockStrategy } from "./geometry-lock-strategy.interface";
import type { MotionPromptStrategy } from "./motion-prompt-strategy.interface";
import type { NegativePromptStrategy } from "./negative-prompt-strategy.interface";
import type { SemanticPromptStrategy } from "./semantic-prompt-strategy.interface";

export interface PromptStrategyResult {
  semanticPromptStrategy: SemanticPromptStrategy;
  geometryLockStrategy: GeometryLockStrategy;
  motionPromptStrategy: MotionPromptStrategy;
  cinematicPromptStrategy: CinematicPromptStrategy;
  negativePromptStrategy: NegativePromptStrategy;
}
