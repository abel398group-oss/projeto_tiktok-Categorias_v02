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
    `A premium cinematic commercial video featuring ${productName}, physically rigid and geometrically unchanged while performing a slow controlled cinematic showcase motion.`
  );
  lines.push("");
  lines.push(
    "Use the product images and metadata as the absolute primary visual reference. Preserve the exact geometry, proportions, materials, surface finish, color, texture, machining details, and product identity."
  );
  lines.push("");
  lines.push(
    "The object may gently rotate, slightly tilt, slowly float, or perform elegant premium commercial presentation movements, but it must never perform its real-world function."
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
  lines.push("PHYSICS:");
  lines.push(`- Rigidity: ${ai.physicsProfile.rigidity}`);
  lines.push(`- Allowed motion: ${ai.physicsProfile.allowedMotion}`);
  lines.push(`- Showcase motion enabled: ${ai.physicsProfile.showcaseMotion.enabled}`);
  lines.push(`- Showcase motion type: ${ai.physicsProfile.showcaseMotion.type}`);
  lines.push(`- Showcase intensity: ${ai.physicsProfile.showcaseMotion.intensity}`);
  lines.push(`- Allowed axes: ${(ai.physicsProfile.showcaseMotion.allowedAxes || []).join(", ") || "-"}`);
  lines.push(`- Deformation allowed: ${ai.physicsProfile.deformationAllowed}`);
  lines.push("");
  lines.push(toListBlock("MUST PRESERVE", mustPreserve));
  lines.push("");
  if (ai.visualCategory === "industrial_tools") {
    lines.push("INDUSTRIAL SAFETY RULES:");
    lines.push(
      "The drill bits/discs may rotate slowly for cinematic presentation only. They must never drill, cut, penetrate materials, generate sparks, or perform real industrial operations."
    );
    lines.push("");
  }
  if (mustAvoid.length > 0) {
    lines.push(toListBlock("MUST AVOID", mustAvoid));
    lines.push("");
  }
  lines.push("SCENE DIRECTION:");
  lines.push(
    "The product remains physically rigid and geometrically unchanged while performing a slow controlled cinematic showcase motion."
  );
  lines.push(
    "The motion must be slow, elegant, premium, and controlled: gentle rotation, slight tilt, subtle floating, or small presentation movements."
  );
  lines.push("No functional operation. No high-speed spinning. No deformation. No wobbling. No chaotic motion.");
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
