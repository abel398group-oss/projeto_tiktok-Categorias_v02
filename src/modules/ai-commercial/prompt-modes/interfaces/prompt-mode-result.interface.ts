import type { PromptMode } from "./prompt-mode.interface";

export interface PromptModeResult {
  selectedMode: PromptMode;
  reason: string;
  warnings: string[];
}
