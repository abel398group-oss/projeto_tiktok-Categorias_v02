import type { EnrichedMetadata, ExportLocalMetadata } from "../ai-commercial/interfaces/enriched-metadata.interface";
import { CommercialContextBuilderImpl } from "./builders/commercial-context.builder";

export class CommercialContextService {
  /** @type {CommercialContextBuilderImpl} */
  builder;

  constructor(builder = new CommercialContextBuilderImpl()) {
    this.builder = builder;
  }

  /**
   * @param {ExportLocalMetadata} metadata
   * @returns {EnrichedMetadata}
   */
  build(metadata) {
    return this.builder.build(metadata);
  }
}

