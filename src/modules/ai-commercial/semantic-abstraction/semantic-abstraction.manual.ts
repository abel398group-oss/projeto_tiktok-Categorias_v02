import { ProductUnderstandingService } from "../product-understanding/product-understanding.service";
import { SemanticAbstractionService } from "./semantic-abstraction.service";
import { StyleProfilesService } from "../style-profiles/style-profiles.service";

function main() {
  const metadata = {
    title: "Ponteiro SDS Plus para Martelete",
    description: "Ponteiro metálico para uso em martelete rompedor.",
    category: "industrial_tools"
  };

  const pu = new ProductUnderstandingService();
  const understanding = pu.analyze(metadata);

  const sp = new StyleProfilesService();
  const styleProfileResult = sp.selectProfile({ productUnderstanding: understanding });

  const sa = new SemanticAbstractionService();
  const result = sa.abstract({ productUnderstanding: understanding, styleProfileResult });

  const summary = {
    abstractionLevel: result.abstractionLevel,
    originalTerms: result.originalTerms.slice(0, 12),
    abstractedTerms: result.abstractedTerms,
    dangerousTerms: result.dangerousTerms
  };

  console.log(JSON.stringify({ summary, result }, null, 2));
}

main();
