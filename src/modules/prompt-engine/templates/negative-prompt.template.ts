import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";

const BASE_NEGATIVES = [
  "no humans",
  "no hands",
  "no deformation",
  "no morphing",
  "no spinning",
  "no floating",
  "no wobbling",
  "no unrealistic physics",
  "no extra parts",
  "no broken geometry",
  "no geometry reinterpretation",
  "no tool usage",
  "no mechanical operation",
  "no text overlays",
  "no subtitles",
  "no watermark"
];

const INDUSTRIAL_TOOLS_NEGATIVES = [
  "no humans",
  "no hands",
  "no deformation",
  "no morphing",
  "no spinning",
  "no floating",
  "no wobbling",
  "no unrealistic physics",
  "no extra parts",
  "no broken geometry",
  "no geometry reinterpretation",
  "no hybrid tool geometry",
  "no object redesign",
  "no drilling",
  "no cutting",
  "no sparks",
  "no grinders",
  "no drills",
  "no rotary tools",
  "no mandrels",
  "no tool usage",
  "no mechanical operation",
  "no text overlays",
  "no subtitles",
  "no watermark"
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
  const isIndustrialTools = aiCommercial?.visualCategory === "industrial_tools";
  const base = isIndustrialTools ? INDUSTRIAL_TOOLS_NEGATIVES : BASE_NEGATIVES;

  const baseLines = uniq(base);
  const baseSet = new Set(baseLines.map((x) => x.toLowerCase()));

  const extraCandidates = isIndustrialTools
    ? []
    : uniq(mustAvoid)
        .map((x) => normalizeNoLine(x))
        .filter((x) => x && !baseSet.has(x.toLowerCase()));

  const maxExtras = isIndustrialTools ? 0 : 4;
  const lines = [...baseLines, ...extraCandidates.slice(0, maxExtras)];
  return lines.join(", ");
}
