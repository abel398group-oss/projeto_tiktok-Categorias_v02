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
  const mustPreserve = Array.isArray(ai?.visualRules?.mustPreserve) ? ai.visualRules.mustPreserve : [];
  const materials = Array.isArray(ai?.materials) ? ai.materials : [];
  const surfaceFinish = Array.isArray(ai?.surfaceFinish) ? ai.surfaceFinish : [];
  const mustAvoid = Array.isArray(ai?.visualRules?.mustAvoid) ? ai.visualRules.mustAvoid : [];

  const lines: string[] = [];
  lines.push(
    `A premium cinematic commercial video featuring ${productName} as a static hero object, perfectly rigid, physically grounded, and geometrically unchanged during the entire shot.`
  );
  lines.push("");
  lines.push(
    "Use the product images and metadata as the absolute primary visual reference. Preserve the exact geometry, proportions, materials, surface finish, color, texture, machining details, and product identity."
  );
  lines.push("");
  lines.push(
    "The object itself must never rotate, spin, tilt, float, animate, or perform any motion. All cinematic movement must come exclusively from the camera choreography around the stationary product."
  );
  lines.push("");
  if (description) {
    lines.push("PRODUCT DESCRIPTION (REFERENCE ONLY):");
    lines.push(description);
    lines.push("");
  }
  if (category) {
    lines.push("CATEGORY URL (REFERENCE):");
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
  if (ai.visualCategory === "industrial_tools") {
    lines.push("INDUSTRIAL SAFETY RULES:");
    lines.push(
      "The tool must appear as a standalone premium commercial object. No drills, grinders, rotary machines, holders, mandrels, chucks, or attached industrial devices may appear. The product itself is the only hero object in the scene."
    );
    lines.push("");
  }
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
  lines.push("No functional operation. No deformation. No wobbling. No chaotic motion. No camera shake.");
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
