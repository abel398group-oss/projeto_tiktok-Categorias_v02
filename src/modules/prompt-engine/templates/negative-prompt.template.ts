import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";

const GLOBAL_NEGATIVES = [
  "no humans",
  "no hands",
  "no faces",
  "no body parts",
  "no morphing",
  "no deformation",
  "no uncontrolled floating",
  "no unrealistic physics",
  "no high-speed spinning",
  "no broken geometry",
  "no incorrect product shape",
  "no extra parts",
  "no missing parts",
  "no low quality textures",
  "no blurry details",
  "no text artifacts",
  "no subtitles",
  "no logos invented by AI",
  "no watermark",
  "no drilling action unless explicitly requested",
  "no product melting",
  "no wobbling",
  "no camera shake"
];

function normalizeNoLine(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower.startsWith("no ")) return `no ${t.slice(3).trim()}`.trim();
  return `no ${t}`.trim();
}

function uniq(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const n = normalizeNoLine(l);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function buildNegativePrompt(aiCommercial: AiCommercial): string {
  const mustAvoid = Array.isArray(aiCommercial?.visualRules?.mustAvoid) ? aiCommercial.visualRules.mustAvoid : [];
  const lines = uniq([...GLOBAL_NEGATIVES, ...mustAvoid]);
  return lines.join("\n");
}
