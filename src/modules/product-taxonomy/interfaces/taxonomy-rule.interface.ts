import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";
import type { ExportLocalMetadata } from "../../ai-commercial/interfaces/enriched-metadata.interface";

export interface TaxonomyRuleContext {
  metadata: ExportLocalMetadata;
  text: string;
}

export interface TaxonomyRule {
  id: string;
  visualCategory: AiCommercial["visualCategory"];
  match(ctx: TaxonomyRuleContext): boolean;
  build(ctx: TaxonomyRuleContext): Partial<AiCommercial>;
}

