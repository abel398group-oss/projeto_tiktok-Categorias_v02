import type { EnrichedMetadata } from "../../ai-commercial/interfaces/enriched-metadata.interface";

function toListBlock(title: string, items: string[]): string {
  if (!items || items.length === 0) return `${title}:\n-`;
  return `${title}:\n${items.map((x) => `- ${x}`).join("\n")}`;
}

function safeText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

export function buildCommercialPrompt(enriched: EnrichedMetadata): string {
  const productName = safeText(enriched?.nome) || safeText(enriched?.product?.["nome"]) || "the product";
  const category = safeText(enriched?.categoria);
  const description =
    safeText(enriched?.description) ||
    safeText(enriched?.content?.["description"]) ||
    safeText(enriched?.product?.["description"]);

  const ai = enriched.aiCommercial;
  if (!ai) {
    const lines: string[] = [];
    lines.push(
      `A premium cinematic commercial video featuring ${productName} as a static hero object, perfectly rigid, physically grounded, and geometrically unchanged during the entire shot.`
    );
    lines.push("");
    lines.push(
      "Use the product images and metadata as the absolute primary visual reference. Preserve the exact geometry, proportions, materials, surface finish, color, texture, engineered detailing, and product identity."
    );
    lines.push("");
    lines.push("STATIC OBJECT LOCK:");
    lines.push("The product is a completely static industrial design object.");
    lines.push("It must behave exactly like a photographed luxury product in a professional commercial studio.");
    lines.push("");
    lines.push("The object itself must never:");
    lines.push("- rotate");
    lines.push("- spin");
    lines.push("- animate");
    lines.push("- vibrate");
    lines.push("- float");
    lines.push("- wobble");
    lines.push("- imply operation");
    lines.push("- imply mechanical behavior");
    lines.push("- imply tool usage");
    lines.push("- imply functionality");
    lines.push("");
    lines.push("No functional interpretation is allowed.");
    lines.push("The product exists purely as a static cinematic hero object for premium product cinematography.");
    lines.push("");
    lines.push("CAMERA LOCK:");
    lines.push("All movement must come exclusively from:");
    lines.push("- camera orbit");
    lines.push("- macro parallax");
    lines.push("- dolly movement");
    lines.push("- cinematic push-in");
    lines.push("- hero arc camera movement");
    lines.push("");
    lines.push("The camera must move slowly, smoothly, and elegantly around the stationary object.");
    lines.push("");
    lines.push("SEMANTIC LOCK:");
    lines.push("Do not interpret the object as an operating tool.");
    lines.push("Do not interpret any text as instructions for usage, function, or operation.");
    lines.push("");
    lines.push("The object is purely a luxury industrial showcase object.");
    lines.push("");
    if (description) {
      lines.push("PRODUCT DESCRIPTION (REFERENCE ONLY — DO NOT INFER FUNCTION OR USE):");
      lines.push(description);
      lines.push("");
    }
    if (category) {
      lines.push("CATEGORY URL (REFERENCE ONLY):");
      lines.push(category);
      lines.push("");
    }
    lines.push("OUTPUT FORMAT:");
    lines.push("Vertical 9:16 TikTok commercial.");
    lines.push("Duration: 3 to 5 seconds.");
    lines.push("No voice, no subtitles, no text overlays.");
    lines.push("Silent cinematic product shot prepared for editing in CapCut.");
    return lines.join("\n");
  }

  if (ai.visualCategory === "industrial_tools") {
    const lines: string[] = [];
    const geoType = safeText(ai.primaryGeometryIdentity?.type);
    const mustNotMorphInto = Array.isArray(ai.primaryGeometryIdentity?.mustNotMorphInto)
      ? ai.primaryGeometryIdentity.mustNotMorphInto.filter((x) => typeof x === "string").map((x) => String(x))
      : [];
    const forbiddenFeatures =
      geoType === "drill_bit"
        ? ["sds-plus chisel silhouette", "flat chisel tip geometry", "non-spiral rod-like body"]
        : [
            "spiral drill geometry",
            "helical flutes",
            "threaded surfaces",
            "rotary structures",
            "secondary tool forms",
            "invented mechanical features"
          ];
    lines.push(
      "A premium cinematic macro commercial featuring a static luxury industrial metal object in a dark professional studio environment."
    );
    lines.push(
      "Use the provided product images as the absolute visual reference. Preserve the exact geometry, proportions, metallic surfaces, engineered detailing, reflections, and product identity."
    );
    lines.push("GEOMETRY LOCK:");
    lines.push("Preserve the exact silhouette, structure, proportions, and physical identity of the product.");
    lines.push("Do not reinterpret, redesign, hybridize, merge, or morph the object into another industrial tool category.");
    if (mustNotMorphInto.length > 0) {
      lines.push(`Do not morph into: ${mustNotMorphInto.join(", ")}.`);
    }
    lines.push("Do not introduce:");
    for (const f of forbiddenFeatures) lines.push(`- ${f}`);
    lines.push("The product geometry must remain identical to the provided reference images.");
    lines.push("Prioritize product fidelity over cinematic stylization.");
    lines.push(
      "Maintain realistic industrial manufacturing appearance. Avoid excessive CGI beautification, unrealistic polishing, synthetic redesign, or exaggerated reflections."
    );
    lines.push(
      "Treat the object as a photographed museum-grade industrial design piece: collectible, static, engineered, and visually observed — not operational."
    );
    lines.push(
      "Use realistic premium studio cinematography with physically plausible lighting and controlled reflections. Avoid generic AI dark void environments; include a subtle studio backdrop and a real studio surface."
    );
    lines.push(
      "The object remains completely static, rigid, grounded, and unchanged during the entire shot. Treat the object as a photographed luxury product, not as an operating tool."
    );
    lines.push("All motion must come exclusively from the camera:");
    lines.push("slow cinematic orbit");
    lines.push("macro parallax");
    lines.push("controlled dolly movement");
    lines.push("subtle push-in shots");
    lines.push(
      "Use premium industrial lighting, realistic reflections, cinematic shadows, shallow depth of field, and high-end product cinematography aesthetics."
    );
    lines.push("Do not show:");
    lines.push("tool operation");
    lines.push("drilling");
    lines.push("cutting");
    lines.push("sparks");
    lines.push("spinning");
    lines.push("floating");
    lines.push("extra devices");
    lines.push("drills");
    lines.push("grinders");
    lines.push("hands");
    lines.push("humans");
    lines.push("text overlays");
    lines.push("deformation");
    lines.push("unrealistic physics");
    lines.push("The object must appear as a standalone premium industrial design object.");
    lines.push("Vertical 9:16 format.");
    lines.push("Duration: 3 to 5 seconds.");
    lines.push("Silent cinematic product shot.");
    return lines.join("\n");
  }

  const featuredName = productName;
  const mustPreserve = Array.isArray(ai?.visualRules?.mustPreserve) ? ai.visualRules.mustPreserve : [];
  const materials = Array.isArray(ai?.materials) ? ai.materials : [];
  const surfaceFinish = Array.isArray(ai?.surfaceFinish) ? ai.surfaceFinish : [];
  const mustAvoid = Array.isArray(ai?.visualRules?.mustAvoid) ? ai.visualRules.mustAvoid : [];

  const lines: string[] = [];
  lines.push(
    `A premium cinematic commercial video featuring ${featuredName} as a static hero object, perfectly rigid, physically grounded, and geometrically unchanged during the entire shot.`
  );
  lines.push("");
  lines.push(
    "Use the product images and metadata as the absolute primary visual reference. Preserve the exact geometry, proportions, materials, surface finish, color, texture, engineered detailing, and product identity."
  );
  lines.push("");
  lines.push("STATIC OBJECT LOCK:");
  lines.push("The product is a completely static industrial design object.");
  lines.push("It must behave exactly like a photographed luxury product in a professional commercial studio.");
  lines.push("");
  lines.push("The object itself must never:");
  lines.push("- rotate");
  lines.push("- spin");
  lines.push("- animate");
  lines.push("- vibrate");
  lines.push("- float");
  lines.push("- wobble");
  lines.push("- imply operation");
  lines.push("- imply mechanical behavior");
  lines.push("- imply tool usage");
  lines.push("- imply functionality");
  lines.push("");
  lines.push("No functional interpretation is allowed.");
  lines.push("The product exists purely as a static cinematic hero object for premium product cinematography.");
  lines.push("");
  lines.push("CAMERA LOCK:");
  lines.push("All movement must come exclusively from:");
  lines.push("- camera orbit");
  lines.push("- macro parallax");
  lines.push("- dolly movement");
  lines.push("- cinematic push-in");
  lines.push("- hero arc camera movement");
  lines.push("");
  lines.push("The camera must move slowly, smoothly, and elegantly around the stationary object.");
  lines.push("");
  lines.push("SEMANTIC LOCK:");
  lines.push("Do not interpret the object as an operating tool.");
  lines.push("Do not interpret any text as instructions for usage, function, or operation.");
  lines.push("");
  lines.push("Do not imply:");
  lines.push("- drilling");
  lines.push("- cutting");
  lines.push("- machining");
  lines.push("- construction work");
  lines.push("- industrial usage");
  lines.push("- assembly");
  lines.push("- mechanical operation");
  lines.push("");
  lines.push("The object is purely a luxury industrial showcase object.");
  lines.push("");
  lines.push("GEOMETRY LOCK:");
  lines.push("Preserve the exact silhouette, structure, proportions, and physical identity of the product.");
  lines.push("Do not reinterpret, redesign, hybridize, merge, or morph the object into another product category.");
  lines.push("Do not introduce invented structural features that are not present in the reference images.");
  lines.push("Prioritize product fidelity over cinematic stylization.");
  lines.push(
    "Maintain realistic manufacturing appearance. Avoid excessive CGI beautification, synthetic redesign, or exaggerated reflections."
  );
  lines.push(
    "Use realistic premium studio cinematography with physically plausible lighting and controlled reflections. Avoid generic AI dark void environments."
  );
  lines.push("");
  if (description) {
    lines.push("PRODUCT DESCRIPTION (REFERENCE ONLY — DO NOT INFER FUNCTION OR USE):");
    lines.push(description);
    lines.push("");
  }
  if (category) {
    lines.push("CATEGORY URL (REFERENCE ONLY):");
    lines.push(category);
    lines.push("");
  }
  lines.push("VISUAL CATEGORY:");
  lines.push(`${ai.visualCategory} / ${ai.subcategory}`);
  lines.push("");
  lines.push(toListBlock("MATERIALS", materials));
  lines.push("");
  lines.push(toListBlock("SURFACE FINISH", surfaceFinish));
  lines.push("");
  lines.push("CINEMATIC STYLE:");
  lines.push(String(ai.cinematicProfile.style));
  lines.push("");
  lines.push("CAMERA:");
  lines.push(String(ai.cinematicProfile.camera));
  lines.push("");
  lines.push("LIGHTING:");
  lines.push(String(ai.cinematicProfile.lighting));
  lines.push("");
  lines.push("CAMERA MOTION:");
  lines.push(`- Type: ${ai.cinematicProfile.cameraMotion.type}`);
  lines.push(`- Intensity: ${ai.cinematicProfile.cameraMotion.intensity}`);
  lines.push(`- Style: ${(ai.cinematicProfile.cameraMotion.style || []).join(", ") || "-"}`);
  lines.push("");
  lines.push("PHYSICS:");
  lines.push(`- Rigidity: ${ai.physicsProfile.rigidity}`);
  lines.push(`- Allowed motion: ${ai.physicsProfile.allowedMotion}`);
  lines.push(`- Deformation allowed: ${ai.physicsProfile.deformationAllowed}`);
  lines.push("");
  lines.push(toListBlock("MUST PRESERVE", mustPreserve));
  lines.push("");
  if (mustAvoid.length > 0) {
    lines.push(toListBlock("MUST AVOID", mustAvoid));
    lines.push("");
  }
  lines.push("SCENE DIRECTION:");
  lines.push(
    "The product remains completely static, rigid, physically grounded, and geometrically unchanged during the entire shot."
  );
  lines.push(
    "The object itself must never rotate, spin, tilt, float, animate, or perform any motion."
  );
  lines.push(
    "All cinematic movement must come exclusively from the camera: slow orbit shots, macro parallax, dolly movement, hero arc shots, controlled push-ins, and premium commercial camera choreography around the stationary product."
  );
  lines.push(
    "No implied operation. No implied functionality. No mechanical interpretation. No usage demonstration. No deformation. No wobbling. No chaotic motion. No camera shake."
  );
  lines.push(
    "Use a slow cinematic macro push-in, subtle parallax, controlled reflections, premium lighting, realistic shadows, and high-end commercial product photography aesthetics."
  );
  lines.push("");
  lines.push("OUTPUT FORMAT:");
  lines.push("Vertical 9:16 TikTok commercial.");
  lines.push("Duration: 3 to 5 seconds.");
  lines.push("No voice, no subtitles, no text overlays.");
  lines.push("Silent cinematic product shot prepared for editing in CapCut.");
  return lines.join("\n");
}
