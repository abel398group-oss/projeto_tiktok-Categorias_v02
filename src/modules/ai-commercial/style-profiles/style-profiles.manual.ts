import { ProductUnderstandingService } from "../product-understanding/product-understanding.service";
import { StyleProfilesService } from "./style-profiles.service";

function main() {
  const metadata = {
    title: "Ponteiro SDS Plus para Martelete",
    description: "Ponteiro metálico para uso em martelete rompedor.",
    category: "industrial_tools"
  };

  const pu = new ProductUnderstandingService();
  const understanding = pu.analyze(metadata);

  const sp = new StyleProfilesService();
  const result = sp.selectProfile({ productUnderstanding: understanding });

  const summary = {
    expected: {
      riskLevel: "extreme",
      selectedProfileName: "premium_product_motion_photography"
    },
    actual: {
      riskLevel: understanding.semanticRiskProfile.riskLevel,
      selectedProfileName: result.selectedProfile.name,
      reason: result.reason,
      warnings: result.warnings
    }
  };

  console.log(JSON.stringify({ summary, understanding, result }, null, 2));
}

main();
