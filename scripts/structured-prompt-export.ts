import * as path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";

import { ProductUnderstandingService } from "../src/modules/ai-commercial/product-understanding/product-understanding.service";
import { LocalCopyEngineService } from "../src/modules/ai-commercial/local-copy-engine/local-copy-engine.service";
import { StyleProfilesService } from "../src/modules/ai-commercial/style-profiles/style-profiles.service";
import { PromptModesService } from "../src/modules/ai-commercial/prompt-modes/prompt-modes.service";
import { PromptStrategyService } from "../src/modules/ai-commercial/prompt-strategy/prompt-strategy.service";
import { PromptCompilerService } from "../src/modules/ai-commercial/prompt-compiler/prompt-compiler.service";

async function tryWriteRunwayShotPrompts(productDir: string): Promise<void> {
  const shots: Array<{ fileName: string; content: string }> = [
    {
      fileName: "v01-hero-shot-runway.txt",
      content: [
        "premium metallic product object,",
        "single isolated product centered in frame,",
        "premium product motion photography,",
        "clean white infinite studio,",
        "soft high-key lighting,",
        "realistic reflections,",
        "minimal luxury aesthetic,",
        "subtle macro camera movement,",
        "fully static product,",
        "preserve exact geometry and proportions"
      ].join("\n")
    },
    {
      fileName: "v02-macro-detail-runway.txt",
      content: [
        "extreme macro product texture shot,",
        "premium metallic surface detail,",
        "soft cinematic reflections,",
        "clean white studio,",
        "shallow depth of field,",
        "luxury product photography,",
        "subtle camera movement,",
        "fully static product,",
        "preserve exact geometry,",
        "focus on material texture and reflective finish"
      ].join("\n")
    },
    {
      fileName: "v03-side-profile-runway.txt",
      content: [
        "side profile premium product showcase,",
        "single isolated metallic product,",
        "clean white infinite studio,",
        "soft diffused lighting,",
        "minimal luxury aesthetic,",
        "controlled reflections,",
        "subtle lateral camera movement,",
        "fully static object,",
        "preserve exact silhouette and proportions"
      ].join("\n")
    },
    {
      fileName: "v04-reflection-shot-runway.txt",
      content: [
        "premium reflective metallic product showcase,",
        "single isolated product,",
        "clean studio environment,",
        "soft high-key lighting,",
        "controlled realistic reflections,",
        "macro luxury product photography,",
        "minimal composition,",
        "subtle cinematic camera motion,",
        "fully static product,",
        "preserve exact geometry and surface finish"
      ].join("\n")
    }
  ];

  try {
    for (const s of shots) {
      await writeFile(path.join(productDir, s.fileName), `${s.content}\n`, "utf8");
    }
  } catch (e) {
    process.stderr.write(
      `[structured-prompt] runway shot prompts failed; continuing without them: ${e instanceof Error ? e.message : String(e)}\n`
    );
  }
}

async function tryWriteLocalCopyAssets(args: { productDir: string; metadata: any }): Promise<void> {
  try {
    const engine = new LocalCopyEngineService();
    const out = engine.generateFromMetadata(args.metadata);

    await writeFile(path.join(args.productDir, "vvoice-script.txt"), `${out.voiceScript}\n`, "utf8");
    await writeFile(path.join(args.productDir, "vcaption-tiktok.txt"), `${out.captionTikTok}\n`, "utf8");
    await writeFile(
      path.join(args.productDir, "voverlay-copy.json"),
      `${JSON.stringify(out.overlayCopy, null, 2)}\n`,
      "utf8"
    );
  } catch (e) {
    process.stderr.write(
      `[structured-prompt] local copy engine failed; continuing without local copy files: ${e instanceof Error ? e.message : String(e)}\n`
    );
  }
}

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

  const sp = new StyleProfilesService();
  let styleProfileResult: any = null;
  try {
    styleProfileResult = sp.selectProfile({ productUnderstanding: understanding });
  } catch (e) {
    styleProfileResult = null;
    process.stderr.write(
      `[structured-prompt] style profile selection failed; falling back without styleProfileResult: ${
        e instanceof Error ? e.message : String(e)
      }\n`
    );
  }

  const pm = new PromptModesService();
  let selectedModeResult: any = null;
  let runwayModeResult: any = null;
  let protectiveModeResult: any = null;
  try {
    selectedModeResult = pm.selectMode({ productUnderstanding: understanding });
    runwayModeResult = pm.selectMode({ productUnderstanding: understanding, preferredMode: "runway-mode" });
    protectiveModeResult = pm.selectMode({ productUnderstanding: understanding, preferredMode: "protective-mode" });
  } catch (e) {
    const risk = understanding?.semanticRiskProfile?.riskLevel || "medium";
    const selectedName = risk === "extreme" ? "protective-mode" : "runway-mode";

    const fallbackMode = (name: string): any => ({
      selectedMode: {
        name,
        description: "fallback",
        verbosity: name === "protective-mode" ? "high" : "low",
        semanticProtection: name === "protective-mode" ? "maximum" : "medium",
        geometryProtection: name === "protective-mode" ? "maximum" : "medium",
        motionProtection: name === "protective-mode" ? "maximum" : "medium",
        preferredPromptStyle: name === "protective-mode" ? "protective" : "minimal_guidance"
      },
      reason: "fallback (mode selection failed)",
      warnings: [e instanceof Error ? e.message : String(e)]
    });

    selectedModeResult = fallbackMode(selectedName);
    runwayModeResult = fallbackMode("runway-mode");
    protectiveModeResult = fallbackMode("protective-mode");
    process.stderr.write(
      `[structured-prompt] prompt mode selection failed; using fallback modes: ${
        e instanceof Error ? e.message : String(e)
      }\n`
    );
  }

  const ps = new PromptStrategyService();
  const strategy =
    styleProfileResult && typeof styleProfileResult === "object"
      ? ps.buildStrategy({ productUnderstanding: understanding, styleProfileResult })
      : ps.buildStrategy(understanding);

  const pc = new PromptCompilerService();
  if (selectedModeResult && typeof selectedModeResult === "object") (strategy as any).promptModeResult = selectedModeResult;
  const compiled = pc.compile(strategy);
  const compiledRunway =
    runwayModeResult && typeof runwayModeResult === "object" ? pc.compileWithMode(strategy, runwayModeResult) : null;
  const compiledProtective =
    protectiveModeResult && typeof protectiveModeResult === "object"
      ? pc.compileWithMode(strategy, protectiveModeResult)
      : null;

  const structuredCommercialPath = path.join(productDir, "structured-commercial-prompt.txt");
  const structuredNegativePath = path.join(productDir, "structured-negative-prompt.txt");
  const structuredCommercialRunwayPath = path.join(productDir, "structured-commercial-prompt-runway.txt");
  const structuredNegativeRunwayPath = path.join(productDir, "structured-negative-prompt-runway.txt");
  const structuredCommercialProtectivePath = path.join(productDir, "structured-commercial-prompt-protective.txt");
  const structuredNegativeProtectivePath = path.join(productDir, "structured-negative-prompt-protective.txt");
  const structuredStoryboardPath = path.join(productDir, "structured-storyboard.txt");
  const structuredDebugPath = path.join(productDir, "structured-prompt-debug.json");

  await writeFile(structuredCommercialPath, `${compiled.commercialPrompt}\n`, "utf8");
  await writeFile(structuredNegativePath, `${compiled.negativePrompt}\n`, "utf8");
  await writeFile(structuredStoryboardPath, `${compiled.storyboardPrompt ?? ""}\n`, "utf8");
  if (compiledRunway) {
    await writeFile(structuredCommercialRunwayPath, `${compiledRunway.commercialPrompt}\n`, "utf8");
    await writeFile(structuredNegativeRunwayPath, `${compiledRunway.negativePrompt}\n`, "utf8");
  }
  if (compiledProtective) {
    await writeFile(structuredCommercialProtectivePath, `${compiledProtective.commercialPrompt}\n`, "utf8");
    await writeFile(structuredNegativeProtectivePath, `${compiledProtective.negativePrompt}\n`, "utf8");
  }

  await tryWriteRunwayShotPrompts(productDir);
  await tryWriteLocalCopyAssets({ productDir, metadata });

  await writeFile(
    structuredDebugPath,
    `${JSON.stringify(
      {
        productUnderstanding: understanding,
        styleProfileResult: styleProfileResult ?? null,
        selectedMode: selectedModeResult ?? null,
        generatedFiles: {
          structuredCommercialPath,
          structuredNegativePath,
          structuredStoryboardPath,
          structuredCommercialRunwayPath: compiledRunway ? structuredCommercialRunwayPath : null,
          structuredNegativeRunwayPath: compiledRunway ? structuredNegativeRunwayPath : null,
          structuredCommercialProtectivePath: compiledProtective ? structuredCommercialProtectivePath : null,
          structuredNegativeProtectivePath: compiledProtective ? structuredNegativeProtectivePath : null,
          structuredDebugPath
        },
        compilerModeBehavior: {
          selectedModeName: selectedModeResult?.selectedMode?.name ?? null,
          runwayCommercialLength: compiledRunway?.commercialPrompt?.length ?? null,
          runwayNegativeLength: compiledRunway?.negativePrompt?.length ?? null,
          protectiveCommercialLength: compiledProtective?.commercialPrompt?.length ?? null,
          protectiveNegativeLength: compiledProtective?.negativePrompt?.length ?? null
        },
        strategy,
        compiled,
        compiledRunway,
        compiledProtective
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        structuredCommercialPath,
        structuredNegativePath,
        structuredCommercialRunwayPath: compiledRunway ? structuredCommercialRunwayPath : null,
        structuredNegativeRunwayPath: compiledRunway ? structuredNegativeRunwayPath : null,
        structuredCommercialProtectivePath: compiledProtective ? structuredCommercialProtectivePath : null,
        structuredNegativeProtectivePath: compiledProtective ? structuredNegativeProtectivePath : null,
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
