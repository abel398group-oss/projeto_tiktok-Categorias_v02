import type { LocalCopyOutput, OverlayCopy } from "./interfaces/local-copy-output.interface";

function safeText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function normalizeSpaces(v: unknown): string {
  return safeText(v)
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  const t = normalizeSpaces(text);
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+/g)
    .map((s) => normalizeSpaces(s))
    .filter(Boolean);
}

function uniqKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const t = normalizeSpaces(v).toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(normalizeSpaces(v));
  }
  return out;
}

function stripBannedPhrases(text: string): string {
  let out = ` ${normalizeSpaces(text)} `;
  const banned = [
    "frete",
    "envio",
    "entrega",
    "pronta entrega",
    "garantia",
    "nota fiscal",
    "nf",
    "pix",
    "boleto",
    "cartão",
    "parcelamento",
    "parcelado",
    "sem juros",
    "devolução",
    "troca",
    "reembolso",
    "promoção",
    "desconto",
    "oferta",
    "imperdível",
    "barato",
    "preço"
  ];
  for (const term of banned) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, " ");
  }
  return normalizeSpaces(out);
}

function extractMeasures(text: string): string[] {
  const t = normalizeSpaces(text);
  if (!t) return [];
  const patterns = [
    /\b\d{1,4}\s*(mm|cm|m)\b/gi,
    /\b\d{1,4}\s*(pol|polegadas|inch|in)\b/gi,
    /\b\d{1,4}\s*x\s*\d{1,4}(\s*x\s*\d{1,4})?\s*(mm|cm|m)?\b/gi
  ];
  const hits: string[] = [];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const v = normalizeSpaces(m[0]);
      if (v) hits.push(v);
    }
  }
  return uniqKeepOrder(hits).slice(0, 3);
}

function extractQuantityHints(text: string): string[] {
  const t = normalizeSpaces(text);
  if (!t) return [];
  const patterns = [
    /\bkit\b[^.]*?\b\d{1,3}\b/gi,
    /\b\d{1,3}\s*(un|unidades|pcs|peças)\b/gi,
    /\bcom\s+\d{1,3}\b/gi
  ];
  const hits: string[] = [];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const v = normalizeSpaces(m[0]);
      if (v) hits.push(v);
    }
  }
  return uniqKeepOrder(hits).slice(0, 2);
}

function pickMaterialHint(text: string): string | null {
  const t = normalizeSpaces(text).toLowerCase();
  if (!t) return null;
  const materials = [
    "aço",
    "inox",
    "hss",
    "carbeto",
    "tungstênio",
    "diamantado",
    "alumínio",
    "metal",
    "metálico",
    "plástico",
    "abs",
    "silicone",
    "madeira",
    "vidro",
    "borracha"
  ];
  for (const m of materials) {
    if (!t.includes(m)) continue;
    if (m === "inox") return "aço inox";
    if (m === "hss") return "aço HSS";
    if (m === "tungstênio") return "carbeto de tungstênio";
    return m;
  }
  return null;
}

function extractPrimaryUseHint(text: string): string | null {
  const t = normalizeSpaces(text);
  if (!t) return null;

  const m = t.match(/\b(ideal|indicado|perfeito)\s+para\s+([^.!?]{6,80})/i);
  if (m && m[2]) return normalizeSpaces(m[2]);

  const p = t.match(/\bpara\s+([^.!?]{6,80})/i);
  if (p && p[1]) return normalizeSpaces(p[1]);

  return null;
}

function guessProductNoun(title: string, description: string): string | null {
  const t = `${normalizeSpaces(title)} ${normalizeSpaces(description)}`.toLowerCase();
  if (!t) return null;
  const mapping: Array<[RegExp, string]> = [
    [/\bdiscos?\b.*\bcorte\b/i, "discos de corte"],
    [/\bdiscos?\b/i, "discos"],
    [/\bbrocas?\b/i, "brocas"],
    [/\bponteiro\b/i, "ponteiro"],
    [/\btalhadeira\b/i, "talhadeira"],
    [/\bchisel\b/i, "ponteiro"],
    [/\bkit\b/i, "kit"]
  ];
  for (const [re, noun] of mapping) {
    if (re.test(t)) return noun;
  }
  return null;
}

function clampSentence(s: string, maxChars: number): string {
  const t = normalizeSpaces(s);
  if (!t) return "";
  if (t.length <= maxChars) return t;
  const clipped = t.slice(0, maxChars).trim();
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace >= 24 ? clipped.slice(0, lastSpace) : clipped).trim();
}

function buildTikTokNativeVoiceScript(args: {
  title: string;
  description: string;
  cleaned: string;
  material: string | null;
  measures: string[];
  qty: string[];
}): string | null {
  const noun = guessProductNoun(args.title, args.description);
  const useHint = extractPrimaryUseHint(args.cleaned);

  const qtyNumber = args.qty
    .map((q) => q.match(/\b(\d{1,3})\b/))
    .filter(Boolean)
    .map((m) => (m ? m[1] : ""))
    .find(Boolean);

  const first = (() => {
    if (qtyNumber && noun && noun !== "kit") {
      return `Kit com ${qtyNumber} ${noun} em ${args.material ?? "acabamento premium"}.`;
    }
    if (qtyNumber) {
      return `Kit com ${qtyNumber} itens em ${args.material ?? "acabamento premium"}.`;
    }
    if (noun && args.material) return `${shortenTitle(args.title)} em ${args.material}.`;
    return `${shortenTitle(args.title)}.`;
  })();

  const second = useHint ? `Ideal para ${useHint}.` : "";

  const third = (() => {
    const parts: string[] = [];
    parts.push("Precisão e durabilidade com acabamento profissional");
    if (args.measures.length > 0) parts.push(args.measures[0]);
    return `${parts.join(". ")}.`;
  })();

  const sentences = [first, second, third]
    .map((s) => clampSentence(s, 120))
    .map((s) => ensurePeriod(s))
    .filter(Boolean);

  const compact = sentences.slice(0, 3).join(" ");
  const safe = stripBannedPhrases(compact);
  return safe ? safe : null;
}

function shortenTitle(title: string): string {
  const t = normalizeSpaces(title);
  if (!t) return "Produto";
  const clipped = t.length > 64 ? t.slice(0, 64).trim() : t;
  return clipped.replace(/[.!?]+$/g, "").trim();
}

function ensurePeriod(s: string): string {
  const t = normalizeSpaces(s);
  if (!t) return "";
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

function joinLines(lines: string[], maxLines: number): string {
  const clean = lines.map((l) => normalizeSpaces(l)).filter(Boolean);
  return clean.slice(0, maxLines).join("\n");
}

function buildOverlayCopy(args: { title: string; features: string[] }): OverlayCopy {
  const bullets = uniqKeepOrder(args.features)
    .map((b) => b.replace(/[.!?]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  while (bullets.length < 3) bullets.push("Acabamento premium");
  return {
    title: shortenTitle(args.title),
    bullets,
    cta: "Confira agora"
  };
}

export class LocalCopyEngineService {
  generateFromMetadata(metadata: any): LocalCopyOutput {
    const title =
      safeText(metadata?.title) ||
      safeText(metadata?.nome) ||
      safeText(metadata?.product?.nome) ||
      safeText(metadata?.product?.title) ||
      "Produto";
    const description = safeText(metadata?.description) || safeText(metadata?.content?.description) || "";
    const category = safeText(metadata?.category) || safeText(metadata?.categoria) || safeText(metadata?.product?.categoria) || "";
    const specsText = safeText(metadata?.specs) || safeText(metadata?.product?.specs) || safeText(metadata?.product?.attributes) || "";

    const rawText = [title, description, category, specsText].map((s) => normalizeSpaces(s)).filter(Boolean).join(". ");
    const cleaned = stripBannedPhrases(rawText);

    const measures = extractMeasures(cleaned);
    const qty = extractQuantityHints(cleaned);
    const material = pickMaterialHint(cleaned);

    const featureCandidates: string[] = [];
    if (material) featureCandidates.push(`Material: ${material}`);
    for (const m of measures) featureCandidates.push(`Medidas: ${m}`);
    for (const q of qty) featureCandidates.push(`Quantidade: ${q}`);

    const sentencePool = uniqKeepOrder(splitSentences(cleaned));
    const useSentence =
      sentencePool.find((s) => /\b(ideal|para|uso|serve|aplicação|indicad[oa])\b/i.test(s)) || sentencePool[0] || "";
    const benefitSentence =
      sentencePool.find((s) => /\b(resistente|durável|precis[ãa]o|acabamento|qualidade|prático)\b/i.test(s)) || "";

    const voiceScriptTikTok = buildTikTokNativeVoiceScript({
      title,
      description,
      cleaned,
      material,
      measures,
      qty
    });

    const voiceLinesFallback = uniqKeepOrder([
      `${shortenTitle(title)}. ${useSentence}`.trim(),
      material ? `Acabamento em ${material} com visual premium.` : "",
      measures.length > 0 ? `Detalhes: ${measures.join(", ")}.` : "",
      benefitSentence ? benefitSentence : "",
      "Confira agora."
    ])
      .map((s) => ensurePeriod(s))
      .filter(Boolean)
      .slice(0, 4);

    const voiceScript = voiceScriptTikTok ?? voiceLinesFallback.join(" ");

    const overlayCopy = buildOverlayCopy({ title, features: featureCandidates });

    const captionLine1 = normalizeSpaces(`${shortenTitle(title)} • ${material ? `acabamento em ${material}` : "acabamento premium"}`);
    const captionLine2 = "Confira agora";
    const captionTikTok = joinLines([captionLine1, captionLine2], 2);

    return {
      voiceScript,
      overlayCopy,
      captionTikTok
    };
  }
}
