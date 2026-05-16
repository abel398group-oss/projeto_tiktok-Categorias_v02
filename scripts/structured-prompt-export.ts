import * as path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";

import { ProductUnderstandingService } from "../src/modules/ai-commercial/product-understanding/product-understanding.service";
import { PromptStrategyService } from "../src/modules/ai-commercial/prompt-strategy/prompt-strategy.service";
import { PromptCompilerService } from "../src/modules/ai-commercial/prompt-compiler/prompt-compiler.service";

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

async function main() {
  const productDir = getArg("--dir") || process.argv[2];
  if (!productDir) {
    throw new Error("missing --dir <productDir>");
  }

  const metaPath = path.join(productDir, "metadata.json");
  await access(metaPath);

  const raw = await readFile(metaPath, "utf8");
  const metadata = JSON.parse(raw);

  const pu = new ProductUnderstandingService();
  const understanding = pu.analyze(metadata);

  const ps = new PromptStrategyService();
  const strategy = ps.buildStrategy(understanding);

  const pc = new PromptCompilerService();
  const compiled = pc.compile(strategy);

  const structuredCommercialPath = path.join(productDir, "structured-commercial-prompt.txt");
  const structuredNegativePath = path.join(productDir, "structured-negative-prompt.txt");
  const structuredStoryboardPath = path.join(productDir, "structured-storyboard.txt");
  const structuredDebugPath = path.join(productDir, "structured-prompt-debug.json");

  await writeFile(structuredCommercialPath, `${compiled.commercialPrompt}\n`, "utf8");
  await writeFile(structuredNegativePath, `${compiled.negativePrompt}\n`, "utf8");
  await writeFile(structuredStoryboardPath, `${compiled.storyboardPrompt ?? ""}\n`, "utf8");
  await writeFile(structuredDebugPath, `${JSON.stringify({ productUnderstanding: understanding, strategy, compiled }, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        structuredCommercialPath,
        structuredNegativePath,
        structuredStoryboardPath,
        structuredDebugPath
      },
      null,
      2
    )}\n`
  );
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack || e.message : String(e)}\n`);
  process.exitCode = 1;
});
