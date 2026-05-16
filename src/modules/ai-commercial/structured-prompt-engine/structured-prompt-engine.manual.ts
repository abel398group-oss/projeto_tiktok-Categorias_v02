import { ProductUnderstandingService } from "../product-understanding/product-understanding.service";
import { PromptStrategyService } from "../prompt-strategy/prompt-strategy.service";
import { PromptCompilerService } from "../prompt-compiler/prompt-compiler.service";

function main() {
  const metadata = {
    title: "Ponteiro SDS Plus para Martelete",
    description: "Ponteiro metálico para uso em martelete rompedor.",
    category: "industrial_tools"
  };

  const pu = new ProductUnderstandingService();
  const understanding = pu.analyze(metadata);

  const ps = new PromptStrategyService();
  const strategy = ps.buildStrategy(understanding);

  const pc = new PromptCompilerService();
  const compiled = pc.compile(strategy);

  const summary = {
    expected: {
      objectType: "sds_plus_chisel",
      riskLevel: "extreme",
      objectMotionAllowed: false,
      debugSource: "structured_prompt_engine"
    },
    actual: {
      objectType: understanding.productIdentity.objectType,
      riskLevel: understanding.semanticRiskProfile.riskLevel,
      objectMotionAllowed: understanding.motionRiskProfile.objectMotionAllowed,
      commercialPromptLength: compiled.commercialPrompt.length,
      negativePromptLength: compiled.negativePrompt.length,
      storyboardPrompt: compiled.storyboardPrompt ?? null,
      debugSource: compiled.debug?.source ?? null
    }
  };

  process.stdout.write(`${JSON.stringify({ summary, understanding, strategy, compiled }, null, 2)}\n`);
}

main();
