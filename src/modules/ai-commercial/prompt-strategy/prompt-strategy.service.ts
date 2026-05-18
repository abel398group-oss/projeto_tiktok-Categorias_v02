import type { ProductUnderstandingResult } from "../product-understanding/interfaces/product-understanding-result.interface";
import type { StyleProfileResult } from "../style-profiles/interfaces/style-profile-result.interface";
import type { PromptStrategyResult } from "./interfaces/prompt-strategy-result.interface";

function normalizeTerm(v: unknown): string {
  const s = typeof v === "string" ? v : v != null ? String(v) : "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqTerms(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const n = normalizeTerm(v);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function toNoTerm(s: string): string {
  const n = normalizeTerm(s);
  if (!n) return "";
  if (n.startsWith("no ")) return n;
  if (n.startsWith("do not ")) return `no ${n.slice("do not ".length).trim()}`;
  return `no ${n}`;
}

function buildCompactNegatives(args: {
  forbiddenSemanticTerms: string[];
  forbiddenObjectMotions: string[];
  forbiddenGeometryChanges: string[];
  maxLengthHint: number;
}): { compactNegativeTerms: string[]; maxLengthHint: number } {
  const fixedBase = ["no humans", "no hands", "no text overlays", "no watermark", "no subtitles"];
  const raw = [
    ...fixedBase,
    ...args.forbiddenSemanticTerms.map(toNoTerm),
    ...args.forbiddenObjectMotions.map(toNoTerm),
    ...args.forbiddenGeometryChanges.map(toNoTerm)
  ];

  const unique = uniqTerms(raw);
  const maxChars = Number.isFinite(args.maxLengthHint) ? Math.max(80, args.maxLengthHint) : 300;

  const out: string[] = [];
  let current = 0;
  for (const t of unique) {
    const add = (out.length === 0 ? 0 : 2) + t.length;
    if (current + add > maxChars) break;
    out.push(t);
    current += add;
  }

  return { compactNegativeTerms: out, maxLengthHint: maxChars };
}

type BuildStrategyInput =
  | ProductUnderstandingResult
  | {
      productUnderstanding: ProductUnderstandingResult;
      styleProfileResult?: StyleProfileResult;
    };

function hasProductUnderstandingEnvelope(input: BuildStrategyInput): input is {
  productUnderstanding: ProductUnderstandingResult;
  styleProfileResult?: StyleProfileResult;
} {
  return typeof (input as any)?.productUnderstanding === "object" && (input as any)?.productUnderstanding != null;
}

export class PromptStrategyService {
  buildStrategy(productUnderstanding: ProductUnderstandingResult): PromptStrategyResult;
  buildStrategy(input: { productUnderstanding: ProductUnderstandingResult; styleProfileResult?: StyleProfileResult }): PromptStrategyResult;
  buildStrategy(input: BuildStrategyInput): PromptStrategyResult {
    const productUnderstanding = hasProductUnderstandingEnvelope(input) ? input.productUnderstanding : input;
    const styleProfileResult = hasProductUnderstandingEnvelope(input) ? input.styleProfileResult : undefined;
    const risk = productUnderstanding?.semanticRiskProfile?.riskLevel || "medium";

    if (risk === "extreme") {
      const forbiddenSemanticTerms = [
        "drill",
        "drill bit",
        "spiral flute",
        "cutting",
        "grinder",
        "rotary tool",
        "hammer drill",
        "demolition"
      ];

      const forbiddenGeometryChanges = [
        "do not morph into a drill bit",
        "do not create spiral flutes",
        "do not bend",
        "do not segment",
        "do not duplicate parts",
        "do not change the tip geometry"
      ];

      const forbiddenObjectMotions = [
        "spin",
        "rotate",
        "wobble",
        "bend",
        "float",
        "morph",
        "vibrate"
      ];

      const maxLengthHint = 350;

      const result: PromptStrategyResult = {
        semanticPromptStrategy: {
          safeProductDescription:
            "static precision engineered metallic object, museum-grade industrial steel form, premium machined geometry",
          forbiddenSemanticTerms,
          semanticReplacementTerms: [
            "precision engineered metallic object",
            "museum-grade industrial steel form",
            "static machined geometry",
            "luxury industrial design object"
          ],
          interpretationInstruction:
            "Treat the product as a static luxury industrial design object, not as an operational tool."
        },
        geometryLockStrategy: {
          geometryInstruction:
            "Preserve the exact silhouette, length, straight axis, rigid metallic body, and non-spiral geometry of the reference product.",
          preservationRules: [
            "preserve exact silhouette",
            "preserve straight longitudinal axis",
            "preserve rigid metallic structure",
            "preserve original tip shape",
            "preserve original proportions"
          ],
          forbiddenGeometryChanges
        },
        motionPromptStrategy: {
          objectMotionInstruction: "The product must remain completely static, rigid, grounded, and unchanged.",
          cameraMotionInstruction: "Only the camera may move around the product.",
          allowedCameraMotions: [
            "slow camera orbit",
            "macro push-in",
            "controlled parallax slide",
            "subtle dolly movement"
          ],
          forbiddenObjectMotions
        },
        cinematicPromptStrategy: {
          sceneType: "premium industrial product studio",
          lightingStyle: "controlled soft reflections, realistic studio lighting",
          surfaceStyle: "neutral physical surface, premium product photography base",
          cameraStyle: "slow cinematic orbit, macro push-in, controlled parallax",
          environmentAvoidance: [
            "generic AI dark void",
            "sci-fi environment",
            "floating space",
            "unrealistic abstract background"
          ]
        },
        negativePromptStrategy: {
          ...buildCompactNegatives({
            forbiddenSemanticTerms,
            forbiddenObjectMotions,
            forbiddenGeometryChanges,
            maxLengthHint
          })
        }
      };
      if (styleProfileResult) result.styleProfileResult = styleProfileResult;
      return result;
    }

    const maxLengthHint = 300;
    const forbiddenObjectMotions = Array.isArray(productUnderstanding?.motionRiskProfile?.forbiddenObjectMotions)
      ? productUnderstanding.motionRiskProfile.forbiddenObjectMotions
      : ["rotate", "spin", "float", "wobble", "morph", "vibrate"];

    const result: PromptStrategyResult = {
      semanticPromptStrategy: {
        safeProductDescription: "premium static product object",
        forbiddenSemanticTerms: Array.isArray(productUnderstanding?.semanticRiskProfile?.dangerousTerms)
          ? productUnderstanding.semanticRiskProfile.dangerousTerms
          : [],
        semanticReplacementTerms: Array.isArray(productUnderstanding?.semanticRiskProfile?.safeSemanticReplacement)
          ? productUnderstanding.semanticRiskProfile.safeSemanticReplacement
          : ["premium product object"],
        interpretationInstruction: "Treat the product as a static photographed studio product, not as an operating tool."
      },
      geometryLockStrategy: {
        geometryInstruction: "Preserve the exact silhouette, structure, proportions, and physical identity of the product.",
        preservationRules: ["preserve exact silhouette", "preserve original proportions", "preserve rigid structure"],
        forbiddenGeometryChanges: ["do not morph", "do not redesign", "do not hybridize", "do not add invented parts"]
      },
      motionPromptStrategy: {
        objectMotionInstruction: "The product remains static and unchanged.",
        cameraMotionInstruction: "Use camera-only motion.",
        allowedCameraMotions: ["slow camera orbit", "macro parallax", "controlled dolly movement", "subtle push-in"],
        forbiddenObjectMotions
      },
      cinematicPromptStrategy: {
        sceneType: "clean premium product studio",
        lightingStyle: "realistic studio lighting with controlled reflections",
        surfaceStyle: "neutral physical surface",
        cameraStyle: "slow cinematic orbit, controlled parallax, subtle push-in",
        environmentAvoidance: ["generic AI dark void", "unrealistic abstract background"]
      },
      negativePromptStrategy: {
        ...buildCompactNegatives({
          forbiddenSemanticTerms: Array.isArray(productUnderstanding?.semanticRiskProfile?.dangerousTerms)
            ? productUnderstanding.semanticRiskProfile.dangerousTerms
            : [],
          forbiddenObjectMotions,
          forbiddenGeometryChanges: ["do not morph", "do not redesign", "do not add invented parts"],
          maxLengthHint
        })
      }
    };
    if (styleProfileResult) result.styleProfileResult = styleProfileResult;
    return result;
  }
}
