import * as path from "node:path";
import { access, mkdir, readFile } from "node:fs/promises";

import { CommercialContextService } from "../src/modules/commercial-context/commercial-context.service";
import { PromptEngineService } from "../src/modules/prompt-engine/prompt-engine.service";
import { PromptOutputExporter } from "../src/modules/prompt-engine/exporters/prompt-output.exporter";

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

  const metaPathNested = path.join(productDir, "metadata", "metadata.json");
  const metaPathLegacy = path.join(productDir, "metadata.json");
  const metaPath = await (async () => {
    try {
      await access(metaPathNested);
      return metaPathNested;
    } catch {
      await access(metaPathLegacy);
      return metaPathLegacy;
    }
  })();

  const raw = await readFile(metaPath, "utf8");
  const metadata = JSON.parse(raw);

  const ctx = new CommercialContextService();
  const enriched = ctx.build(metadata);

  const pe = new PromptEngineService();
  const promptFiles = pe.generate(enriched);

  const legacyPromptsDir = path.join(productDir, "legacy-prompts");
  await mkdir(legacyPromptsDir, { recursive: true });
  const saved = await PromptOutputExporter.exportToProductDir(legacyPromptsDir, promptFiles);
  await access(saved.commercialPromptPath);
  await access(saved.negativePromptPath);
  await access(saved.storyboardPath);

  process.stdout.write(`${JSON.stringify({ ok: true, ...saved }, null, 2)}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack || e.message : String(e)}\n`);
  process.exitCode = 1;
});
