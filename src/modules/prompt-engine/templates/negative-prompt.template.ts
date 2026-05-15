import type { AiCommercial } from "../../ai-commercial/interfaces/ai-commercial.interface";

const GLOBAL_NEGATIVES = [
  "no humans",
  "no hands",
  "no faces",
  "no body parts",
  "no morphing",
  "no deformation",
  "no rotating product",
  "no spinning object",
  "no rotating mechanics",
  "no spinning implication",
  "no floating product",
  "no animated product",
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
  "no implied operation",
  "no implied functionality",
  "no mechanical interpretation",
  "no industrial action",
  "no operational semantics",
  "no active tool behavior",
  "no usage demonstration",
  "no tool usage",
  "no drilling",
  "no cutting",
  "no machining",
  "no construction work",
  "no industrial usage",
  "no assembly",
  "no mechanical operation",
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
  const industrialExtras =
    aiCommercial?.visualCategory === "industrial_tools"
      ? [
          "no drill machine",
          "no grinder",
          "no rotary tool",
          "no power tool body",
          "no chuck",
          "no mandrel",
          "no industrial device attached"
        ]
      : [];

  const lines = uniq([...GLOBAL_NEGATIVES, ...industrialExtras, ...mustAvoid]);
  return lines.join("\n");
}
