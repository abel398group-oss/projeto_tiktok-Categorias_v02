import type { EnrichedMetadata } from "../ai-commercial/interfaces/enriched-metadata.interface";
import type { PromptFiles } from "./interfaces/prompt-files.interface";
import { buildCommercialPrompt } from "./templates/cinematic-prompt.template";
import { buildNegativePrompt } from "./templates/negative-prompt.template";
import { buildStoryboard } from "./templates/storyboard.template";

export class PromptEngineService {
  /**
   * @param {EnrichedMetadata} enrichedMetadata
   * @returns {PromptFiles}
   */
  generate(enrichedMetadata) {
    const ai = enrichedMetadata.aiCommercial;
    return {
      commercialPrompt: buildCommercialPrompt(enrichedMetadata),
      negativePrompt: buildNegativePrompt(ai),
      storyboard: buildStoryboard(ai)
    };
  }
}

