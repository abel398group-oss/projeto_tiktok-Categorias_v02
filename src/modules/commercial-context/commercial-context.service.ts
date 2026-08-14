import type { EnrichedMetadata, ExportLocalMetadata } from "../ai-commercial/interfaces/enriched-metadata.interface";
import { CommercialContextBuilderImpl } from "./builders/commercial-context.builder";

export class CommercialContextService {
  /** @type {CommercialContextBuilderImpl} */
  builder;

  constructor(builder = new CommercialContextBuilderImpl()) {
    this.builder = builder;
  }

  build(metadata: ExportLocalMetadata): EnrichedMetadata {
    return this.builder.build(metadata);
  }
}
