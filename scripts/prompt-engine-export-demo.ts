import * as path from "node:path";
import { access, readFile } from "node:fs/promises";

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

  const metaPath = path.join(productDir, "metadata.json");
  await access(metaPath);

  const raw = await readFile(metaPath, "utf8");
  const metadata = JSON.parse(raw);

  const ctx = new CommercialContextService();
  const enriched = ctx.build(metadata);

  const pe = new PromptEngineService();
  const promptFiles = pe.generate(enriched);

  const saved = await PromptOutputExporter.exportToProductDir(productDir, promptFiles);
  await access(saved.commercialPromptPath);
  await access(saved.negativePromptPath);
  await access(saved.storyboardPath);

  process.stdout.write(`${JSON.stringify({ ok: true, ...saved }, null, 2)}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack || e.message : String(e)}\n`);
  process.exitCode = 1;
});

