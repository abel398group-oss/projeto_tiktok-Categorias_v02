import { ProductUnderstandingService } from "../product-understanding/product-understanding.service";
import { PromptModesService } from "./prompt-modes.service";

function main() {
  const metadata = {
    title: "Ponteiro SDS Plus para Martelete",
    description: "Ponteiro metálico para uso em martelete rompedor.",
    category: "industrial_tools"
  };

  const pu = new ProductUnderstandingService();
  const understanding = pu.analyze(metadata);

  const pm = new PromptModesService();
  const result = pm.selectMode({ productUnderstanding: understanding });

  const summary = {
    expected: {
      riskLevel: "extreme",
      selectedMode: "protective-mode"
    },
    actual: {
      riskLevel: understanding.semanticRiskProfile.riskLevel,
      selectedMode: result.selectedMode.name,
      reason: result.reason,
      warnings: result.warnings
    }
  };

  console.log(JSON.stringify({ summary, result }, null, 2));
}

main();
