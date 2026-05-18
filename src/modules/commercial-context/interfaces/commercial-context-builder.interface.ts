import type { EnrichedMetadata, ExportLocalMetadata } from "../../ai-commercial/interfaces/enriched-metadata.interface";

export interface CommercialContextBuilder {
  build(metadata: ExportLocalMetadata): EnrichedMetadata;
}

