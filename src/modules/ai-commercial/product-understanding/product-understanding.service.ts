import type { ProductUnderstandingResult } from "./interfaces/product-understanding-result.interface";

function safeText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function normalize(s: string): string {
  return safeText(s)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase();
}

function extractText(metadata: any): string {
  const title = safeText(metadata?.nome) || safeText(metadata?.title) || safeText(metadata?.product?.name);
  const desc =
    safeText(metadata?.description) ||
    safeText(metadata?.content?.description) ||
    safeText(metadata?.product?.description);
  const category = safeText(metadata?.category) || safeText(metadata?.categoria) || safeText(metadata?.product?.categoria);
  return [title, desc, category].filter((x) => x && String(x).trim() !== "").join("\n");
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const t = normalize(text);
  return keywords.some((k) => t.includes(String(k).toLowerCase()));
}

export class ProductUnderstandingService {
  analyze(metadata: any): ProductUnderstandingResult {
    const text = extractText(metadata);
    const isSds =
      hasAnyKeyword(text, ["sds", "sds plus", "ponteiro", "talhadeira", "chisel", "martelete"]) ||
      hasAnyKeyword(text, ["hammer drill"]);

    if (isSds) {
      return {
        productIdentity: {
          objectType: "sds_plus_chisel",
          visualClass: "demolition_tool",
          category: "industrial_tools",
          subcategory: "sds_plus_chisel",
          materialFamily: "machined_steel",
          surfaceFinish: "polished_reflective_metal",
          rigidity: "fully_rigid",
          semanticAlias: "precision engineered metallic object"
        },
        geometryProfile: {
          geometryFamily: "long_rigid_axial_metal_object",
          shapeDescription:
            "elongated straight metallic tool with narrow cylindrical body and non-spiral pointed/chisel tip",
          primaryAxis: "vertical_longitudinal_axis",
          symmetry: "axial",
          mustRemainRigid: true,
          mustRemainStraight: true,
          mustNotMorph: true,
          mustNotTwist: true,
          mustNotSpiralize: true,
          mustNotSegment: true
        },
        semanticRiskProfile: {
          riskLevel: "extreme",
          dangerousTerms: [
            "drill",
            "drill bit",
            "spiral flute",
            "cutting",
            "grinder",
            "rotary tool",
            "hammer drill",
            "demolition"
          ],
          forbiddenBehaviors: [
            "drilling",
            "cutting",
            "spinning",
            "rotating",
            "sparking",
            "breaking concrete",
            "tool usage",
            "mechanical operation"
          ],
          safeSemanticReplacement: [
            "precision engineered metallic object",
            "museum-grade industrial steel form",
            "static machined geometry",
            "luxury industrial design object"
          ]
        },
        motionRiskProfile: {
          objectMotionAllowed: false,
          allowedCameraMotions: [
            "slow camera orbit",
            "macro push-in",
            "controlled parallax slide",
            "subtle dolly movement"
          ],
          forbiddenObjectMotions: ["spin", "rotate", "wobble", "bend", "float", "morph", "vibrate"]
        }
      };
    }

    const category = safeText(metadata?.category) || safeText(metadata?.categoria) || "unknown";
    return {
      productIdentity: {
        objectType: "generic_product",
        visualClass: "consumer_product",
        category: category || "unknown",
        subcategory: "unknown",
        materialFamily: "unknown",
        surfaceFinish: "unknown",
        rigidity: "unknown",
        semanticAlias: "premium product object"
      },
      geometryProfile: {
        geometryFamily: "generic_solid_object",
        shapeDescription: "generic product object with stable rigid geometry",
        primaryAxis: "unknown",
        symmetry: "unknown",
        mustRemainRigid: true,
        mustRemainStraight: false,
        mustNotMorph: true,
        mustNotTwist: true,
        mustNotSpiralize: true,
        mustNotSegment: true
      },
      semanticRiskProfile: {
        riskLevel: "medium",
        dangerousTerms: [],
        forbiddenBehaviors: [],
        safeSemanticReplacement: ["premium product object", "static hero object", "photographed studio product"]
      },
      motionRiskProfile: {
        objectMotionAllowed: false,
        allowedCameraMotions: ["slow camera orbit", "macro parallax", "controlled dolly movement", "subtle push-in"],
        forbiddenObjectMotions: ["rotate", "spin", "float", "wobble", "morph", "vibrate"]
      }
    };
  }
}
