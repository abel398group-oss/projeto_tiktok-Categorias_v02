import type { PromptStrategyResult } from "../prompt-strategy/interfaces/prompt-strategy-result.interface";
import type { CompiledPromptOutput } from "./interfaces/compiled-prompt-output.interface";

function normalizeSpaces(s: string): string {
  return String(s || "")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinSentences(parts: string[]): string {
  const clean = parts.map((p) => normalizeSpaces(p)).filter((p) => p.length > 0);
  return normalizeSpaces(clean.join(" "));
}

function ensurePeriod(s: string): string {
  const t = normalizeSpaces(s);
  if (!t) return "";
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

function joinAvoidList(envs: string[]): string {
  const items = Array.isArray(envs) ? envs.map((x) => normalizeSpaces(String(x))).filter(Boolean) : [];
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function clampChars(s: string, maxChars: number): string {
  const t = normalizeSpaces(s);
  if (!maxChars || !Number.isFinite(maxChars) || maxChars <= 0) return t;
  if (t.length <= maxChars) return t;
  const clipped = t.slice(0, maxChars);
  const idx = clipped.lastIndexOf(".");
  if (idx >= 120) return clipped.slice(0, idx + 1).trim();
  return clipped.trim();
}

function compileNegative(terms: string[], maxLengthHint: number): string {
  const list = Array.isArray(terms) ? terms.map((t) => normalizeSpaces(String(t)).toLowerCase()).filter(Boolean) : [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of list) {
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }
  const maxChars = Number.isFinite(maxLengthHint) ? Math.max(80, maxLengthHint) : 300;

  const out: string[] = [];
  let current = 0;
  for (const t of unique) {
    const add = (out.length === 0 ? 0 : 2) + t.length;
    if (current + add > maxChars) break;
    out.push(t);
    current += add;
  }
  return out.join(", ");
}

function prioritizeNegativeTerms(args: { baseTerms: string[]; extraTerms: string[] }): string[] {
  const base = Array.isArray(args.baseTerms) ? args.baseTerms : [];
  const extra = Array.isArray(args.extraTerms) ? args.extraTerms : [];

  const fixedFront = ["no humans", "no hands", "no text overlays", "no watermark", "no subtitles"];

  const normalizedBase = base.map((t) => normalizeSpaces(String(t)).toLowerCase()).filter(Boolean);
  const normalizedExtra = extra.map((t) => normalizeSpaces(String(t)).toLowerCase()).filter(Boolean);

  const frontWanted = [...fixedFront, ...normalizedExtra];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const t of frontWanted) {
    if (!t) continue;
    if (seen.has(t)) continue;
    if (fixedFront.includes(t) && !normalizedBase.includes(t)) continue;
    seen.add(t);
    out.push(t);
  }

  for (const t of normalizedBase) {
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }

  return out;
}

function isExtremeRisk(strategy: PromptStrategyResult): boolean {
  const terms = Array.isArray(strategy?.semanticPromptStrategy?.forbiddenSemanticTerms)
    ? strategy.semanticPromptStrategy.forbiddenSemanticTerms
    : [];
  return terms.map((t) => normalizeSpaces(String(t)).toLowerCase()).includes("demolition");
}

function softenIndustrialSemantics(s: string): string {
  return normalizeSpaces(s)
    .replace(/\bindustrial\b/gi, "premium")
    .replace(/\bdemolition\b/gi, "")
    .replace(/\btool\b/gi, "object")
    .replace(/\bsteel form\b/gi, "metallic product object")
    .replace(/\bsteel\b/gi, "metallic")
    .replace(/\s+/g, " ")
    .trim();
}

export class PromptCompilerService {
  compile(strategy: PromptStrategyResult): CompiledPromptOutput {
    const styleProfile = strategy?.styleProfileResult?.selectedProfile;
    const extreme = isExtremeRisk(strategy);

    const safeProductDescriptionRaw = strategy?.semanticPromptStrategy?.safeProductDescription ?? "";
    const interpretationInstructionRaw = strategy?.semanticPromptStrategy?.interpretationInstruction ?? "";
    const geometryInstruction = strategy?.geometryLockStrategy?.geometryInstruction ?? "";
    const objectMotionInstruction = strategy?.motionPromptStrategy?.objectMotionInstruction ?? "";
    const cameraMotionInstruction = strategy?.motionPromptStrategy?.cameraMotionInstruction ?? "";

    const sceneType = strategy?.cinematicPromptStrategy?.sceneType ?? "";
    const lightingStyle = strategy?.cinematicPromptStrategy?.lightingStyle ?? "";
    const surfaceStyle = strategy?.cinematicPromptStrategy?.surfaceStyle ?? "";
    const cameraStyle = strategy?.cinematicPromptStrategy?.cameraStyle ?? "";
    const avoidance = joinAvoidList(strategy?.cinematicPromptStrategy?.environmentAvoidance ?? []);

    const safeProductDescription = styleProfile
      ? extreme
        ? "premium metallic product object, precision metallic geometry, luxury machined product, premium reflective product surface"
        : safeProductDescriptionRaw
      : safeProductDescriptionRaw;

    const interpretationInstruction = styleProfile
      ? softenIndustrialSemantics(interpretationInstructionRaw)
      : interpretationInstructionRaw;

    const profileCommercial = styleProfile
      ? joinSentences([
          ensurePeriod("premium product motion photography, luxury product showcase, minimal luxury aesthetic"),
          ensurePeriod(styleProfile.visualLanguage),
          ensurePeriod(`Background: ${styleProfile.background}`),
          ensurePeriod(`Lighting: ${styleProfile.lighting}`),
          ensurePeriod("Macro product photography, realistic product reflections"),
          ensurePeriod(`Reflections: ${styleProfile.reflectionStyle}`),
          ensurePeriod(`Editing: ${styleProfile.editingStyle}`),
          ensurePeriod(`Camera motion: ${styleProfile.cameraMotion}`),
          ensurePeriod("Use subtle camera-only movement and micro motion; avoid dramatic or aggressive motion"),
          ensurePeriod(`Object motion: ${styleProfile.objectMotion}`),
          ensurePeriod("The product is fully static, rigid, and unchanged at all times"),
          ensurePeriod(`Environment complexity: ${styleProfile.environmentComplexity}; fidelity priority: ${styleProfile.fidelityPriority}`)
        ])
      : "";

    const cinematicSentence = joinSentences([
      "Film it in a",
      sceneType,
      "with",
      lightingStyle,
      surfaceStyle ? `, ${surfaceStyle}` : "",
      cameraStyle ? `, and ${cameraStyle}` : ""
    ]);

    const avoidSentence = avoidance ? `Avoid ${avoidance}.` : "";

    const commercialPromptRaw = styleProfile
      ? joinSentences([
          ensurePeriod(softenIndustrialSemantics(safeProductDescription)),
          ensurePeriod(profileCommercial),
          ensurePeriod(geometryInstruction),
          ensurePeriod(objectMotionInstruction),
          ensurePeriod(cameraMotionInstruction)
        ])
      : joinSentences([
          ensurePeriod(safeProductDescription),
          ensurePeriod(interpretationInstruction),
          ensurePeriod(geometryInstruction),
          ensurePeriod(objectMotionInstruction),
          ensurePeriod(cameraMotionInstruction),
          ensurePeriod(cinematicSentence),
          avoidSentence
        ]);

    const commercialPrompt = clampChars(commercialPromptRaw, 900);

    const extraPhotographyNegatives = styleProfile
      ? ["no aggressive motion", "no action sequence", "no dramatic environment", "no explosion", "no sparks", "no destruction"]
      : [];

    const negativeTerms = styleProfile
      ? prioritizeNegativeTerms({
          baseTerms: strategy?.negativePromptStrategy?.compactNegativeTerms ?? [],
          extraTerms: extraPhotographyNegatives
        })
      : strategy?.negativePromptStrategy?.compactNegativeTerms ?? [];

    const negativePrompt = compileNegative(
      negativeTerms,
      strategy?.negativePromptStrategy?.maxLengthHint ?? 300
    );

    const storyboardPrompt = joinSentences([
      "Scene 1: macro hero shot preserving exact product geometry.",
      "Scene 2: slow camera orbit with product fully static.",
      "Scene 3: final premium product still with realistic reflections."
    ]);

    const out: CompiledPromptOutput = {
      commercialPrompt,
      negativePrompt,
      storyboardPrompt,
      debug: {
        source: "structured_prompt_engine",
        commercialPromptLength: commercialPrompt.length,
        negativePromptLength: negativePrompt.length,
        strategySummary: {
          safeProductDescription: normalizeSpaces(safeProductDescription),
          styleProfileName: styleProfile?.name ?? null,
          styleProfilePreferredVisualLanguage: styleProfile?.visualLanguage ?? null,
          extremeRisk: extreme,
          riskMaxLengthHint: strategy?.negativePromptStrategy?.maxLengthHint ?? null,
          sceneType: normalizeSpaces(sceneType)
        }
      }
    };

    return out;
  }
}
