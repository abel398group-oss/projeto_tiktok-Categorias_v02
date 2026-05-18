import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, stat, writeFile, readFile } from "node:fs/promises";

const safeErrorMessage = (e) => (e instanceof Error ? e.message : String(e));

const ensureDirExists = async (dirPath) => {
  const st = await stat(dirPath);
  if (!st.isDirectory()) {
    throw new Error(`productDir_not_directory: ${dirPath}`);
  }
};

const parseLastJsonObject = (text) => {
  const t = String(text || "");
  const idx = t.lastIndexOf("{");
  if (idx < 0) return null;
  const candidate = t.slice(idx).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const safeText = (v) => {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
};

const normalizeText = (s) =>
  safeText(s)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

const toListBlock = (title, items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return `${title}:\n-`;
  return `${title}:\n${list.map((x) => `- ${x}`).join("\n")}`;
};

const uniqStrings = (list) => {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
};

const GLOBAL_NEGATIVES = [
  "no humans",
  "no hands",
  "no faces",
  "no body parts",
  "no morphing",
  "no deformation",
  "no rotating product",
  "no spinning object",
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
  "no drilling action unless explicitly requested",
  "no product melting",
  "no wobbling",
  "no camera shake"
];

const normalizeNoLine = (s) => {
  const t = String(s || "")
    .replace(/_/g, " ")
    .trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower.startsWith("no ")) return `no ${t.slice(3).trim()}`.trim();
  return `no ${t}`.trim();
};

const uniqNoLines = (lines) => {
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const n = normalizeNoLine(l);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
};

const buildAiCommercialBaseFromMetadata = (metadata) => {
  const name = normalizeText(metadata?.nome);
  const categoria = normalizeText(metadata?.categoria);
  const description =
    normalizeText(metadata?.description) ||
    normalizeText(metadata?.content?.description) ||
    normalizeText(metadata?.product?.description);
  const text = `${name}\n${categoria}\n${description}`.toLowerCase();

  const hasAny = (keywords) => keywords.some((k) => text.includes(String(k).toLowerCase()));
  const industrialKeywords = ["broca", "brocas", "drill", "carbide", "titanium", "tool", "tools", "industrial"];
  const beautyKeywords = ["beauty", "skincare", "maquiagem", "makeup", "cosmetic", "cosmético", "perfume"];
  const electronicsKeywords = ["electronics", "eletrônico", "eletronico", "usb", "bluetooth", "wireless", "charger", "carregador"];
  const fashionKeywords = ["fashion", "moda", "roupa", "vestido", "camisa", "calça", "calca", "sutiã", "sutia", "lingerie"];

  let visualCategory = "unknown";
  let subcategory = "unknown";
  let cinematicProfile = { style: "unknown", camera: "unknown", lighting: "unknown" };

  if (hasAny(industrialKeywords)) {
    visualCategory = "industrial_tools";
    subcategory = "drill_bits";
    cinematicProfile = { style: "luxury_industrial_macro", camera: "slow_push_in", lighting: "dark_premium_studio" };
  } else if (hasAny(beautyKeywords)) {
    visualCategory = "beauty";
    subcategory = "beauty";
    cinematicProfile = { style: "luxury_beauty_soft_reflections", camera: "unknown", lighting: "warm_soft_premium_studio" };
  } else if (hasAny(electronicsKeywords)) {
    visualCategory = "electronics";
    subcategory = "electronics";
    cinematicProfile = { style: "premium_tech_showcase", camera: "unknown", lighting: "dark_futuristic_reflections" };
  } else if (hasAny(fashionKeywords)) {
    visualCategory = "fashion";
    subcategory = "fashion";
    cinematicProfile = { style: "editorial_fashion_motion", camera: "unknown", lighting: "soft_editorial_studio" };
  }

  const base = {
    visualCategory,
    subcategory,
    materials: [],
    surfaceFinish: [],
    physicsProfile: { rigidity: "unknown", allowedMotion: "camera_only", deformationAllowed: false },
    cinematicProfile: {
      ...cinematicProfile,
      cameraMotion: {
        type: "camera_orbit_showcase",
        intensity: "slow",
        style: ["macro_parallax", "dolly_orbit", "hero_arc_shot", "cinematic_push_in"]
      }
    },
    visualRules: {
      mustPreserve: [],
      mustAvoid: [
        "humans",
        "hands",
        "morphing",
        "deformation",
        "rotating product",
        "spinning object",
        "floating product",
        "animated product",
        "broken geometry",
        "low quality textures",
        "text artifacts"
      ]
    }
  };

  if (visualCategory === "industrial_tools" && subcategory === "drill_bits") {
    base.materials = ["carbide", "hardened_steel"];
    base.surfaceFinish = ["black_titanium_like_coating", "machined_metal"];
    base.physicsProfile.rigidity = "extreme";
    base.visualRules.mustPreserve = [
      "exact_product_geometry",
      "sharp_cutting_tips",
      "spiral_flute_design",
      "hex_shank_shape",
      "metallic_reflections"
    ];
    base.visualRules.mustAvoid.push(
      "drilling action",
      "cutting action",
      "sparks",
      "penetration",
      "unrealistic physics",
      "drill machine",
      "grinder",
      "rotary tool",
      "power tool body",
      "chuck",
      "mandrel",
      "industrial device attached"
    );
  }

  base.materials = uniqStrings(base.materials);
  base.surfaceFinish = uniqStrings(base.surfaceFinish);
  base.visualRules.mustPreserve = uniqStrings(base.visualRules.mustPreserve);
  base.visualRules.mustAvoid = uniqStrings(base.visualRules.mustAvoid);
  return base;
};

const buildCommercialPrompt = (enriched) => {
  const productName = safeText(enriched?.nome) || safeText(enriched?.product?.nome) || "the product";
  const category = safeText(enriched?.categoria);
  const description =
    safeText(enriched?.description) || safeText(enriched?.content?.description) || safeText(enriched?.product?.description);
  const ai = enriched.aiCommercial;
  const mustPreserve = Array.isArray(ai?.visualRules?.mustPreserve) ? ai.visualRules.mustPreserve : [];
  const mustAvoid = Array.isArray(ai?.visualRules?.mustAvoid) ? ai.visualRules.mustAvoid : [];
  const materials = Array.isArray(ai?.materials) ? ai.materials : [];
  const surfaceFinish = Array.isArray(ai?.surfaceFinish) ? ai.surfaceFinish : [];

  const lines = [];
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
  lines.push("The product remains completely static, rigid, physically grounded, and geometrically unchanged during the entire shot.");
  lines.push("The object itself must never rotate, spin, tilt, float, animate, or perform any motion.");
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
};

const buildNegativePrompt = (aiCommercial) => {
  const mustAvoid = Array.isArray(aiCommercial?.visualRules?.mustAvoid) ? aiCommercial.visualRules.mustAvoid : [];
  const industrialExtras =
    aiCommercial?.visualCategory === "industrial_tools"
      ? ["no drill machine", "no grinder", "no rotary tool", "no power tool body", "no chuck", "no mandrel", "no industrial device attached"]
      : [];
  const lines = uniqNoLines([...GLOBAL_NEGATIVES, ...industrialExtras, ...mustAvoid]);
  return lines.join("\n");
};

const buildStoryboard = (aiCommercial) => {
  if (aiCommercial.visualCategory === "industrial_tools" && aiCommercial.subcategory === "drill_bits") {
    return {
      scenes: [
        {
          name: "Hero Shot",
          duration: "3-5s",
          camera: "slow_push_in",
          description:
            "Static hero shot of the drill bit set on a dark premium industrial studio surface. The product stays perfectly still while the camera performs a slow premium orbit/push-in around it, emphasizing rigid machined geometry and controlled reflections."
        },
        {
          name: "Macro Detail",
          duration: "3-5s",
          camera: "macro_parallax",
          description:
            "Extreme macro camera parallax highlighting sharp carbide cross tips, spiral flute design, hex shank structure, machined metal reflections, and premium coating details. The product remains completely static."
        },
        {
          name: "Final Showcase",
          duration: "3-5s",
          camera: "slow_orbit_or_push",
          description:
            "Final static showcase of the complete set, perfectly aligned and grounded. Use elegant camera choreography (slow orbit/dolly) and premium industrial lighting—no tool usage, no spinning, no attached devices."
        }
      ]
    };
  }
  return {
    scenes: [
      {
        name: "Hero Shot",
        duration: "3-5s",
        camera: "slow_push_in",
        description:
          "Static hero object on a clean premium studio surface. The product stays perfectly still while the camera performs a slow push-in/orbit with controlled reflections and realistic shadows."
      },
      {
        name: "Macro Detail",
        duration: "3-5s",
        camera: "macro_parallax",
        description:
          "Macro camera parallax highlighting the most important materials, surface finish, geometry, and premium visual characteristics. The object remains completely static."
      },
      {
        name: "Final Showcase",
        duration: "3-5s",
        camera: "slow_orbit_or_push",
        description:
          "Final clean showcase with elegant camera orbit/dolly movement, stable framing, premium lighting, and strong commercial composition around the stationary product."
      }
    ]
  };
};

const exportPromptFilesToProductDir = async (productDir, promptFiles) => {
  await ensureDirExists(productDir);
  const legacyPromptsDir = path.join(productDir, "legacy-prompts");
  await mkdir(legacyPromptsDir, { recursive: true });
  const commercialPromptPath = path.join(legacyPromptsDir, "commercial-prompt.txt");
  const negativePromptPath = path.join(legacyPromptsDir, "negative-prompt.txt");
  const storyboardPath = path.join(legacyPromptsDir, "storyboard.json");

  await writeFile(commercialPromptPath, `${promptFiles.commercialPrompt}\n`, "utf8");
  await writeFile(negativePromptPath, `${promptFiles.negativePrompt}\n`, "utf8");
  await writeFile(storyboardPath, `${JSON.stringify(promptFiles.storyboard, null, 2)}\n`, "utf8");

  return { commercialPromptPath, negativePromptPath, storyboardPath };
};

const tryRuntimeGeneration = async ({ productDir, metadata }) => {
  await ensureDirExists(productDir);
  let metaObj = metadata;
  if (!metaObj) {
    const nestedMetaPath = path.join(productDir, "metadata", "metadata.json");
    const legacyMetaPath = path.join(productDir, "metadata.json");
    let raw = "";
    try {
      raw = await readFile(nestedMetaPath, "utf8");
    } catch {
      raw = await readFile(legacyMetaPath, "utf8");
    }
    metaObj = JSON.parse(raw);
  }
  const aiCommercial = buildAiCommercialBaseFromMetadata(metaObj);
  const enriched = { ...metaObj, aiCommercial };
  const promptFiles = {
    commercialPrompt: buildCommercialPrompt(enriched),
    negativePrompt: buildNegativePrompt(aiCommercial),
    storyboard: buildStoryboard(aiCommercial)
  };
  return exportPromptFilesToProductDir(productDir, promptFiles);
};

export const generateCommercialPromptOutputs = async ({ repoRoot, productDir, metadata }) => {
  if (!repoRoot || !productDir) throw new Error("missing_args");

  const args = [
    "exec",
    "--yes",
    "--package",
    "tsx@4.19.2",
    "--",
    "tsx",
    "scripts/prompt-engine-export-demo.ts",
    "--dir",
    productDir
  ];

  const child = spawn("npm", args, {
    cwd: repoRoot,
    shell: true,
    windowsHide: true,
    env: {
      ...process.env,
      PRODUCT_DIR: productDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let out = "";
  let err = "";
  child.stdout.on("data", (d) => {
    out += d.toString("utf8");
  });
  child.stderr.on("data", (d) => {
    err += d.toString("utf8");
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`prompt_export_failed exitCode=${exitCode} stderr=${err.trim() || "-"}`);
  }

  const parsed = parseLastJsonObject(out);
  const ok = parsed && typeof parsed === "object" && parsed.ok === true;
  if (!ok) {
    throw new Error(`prompt_export_bad_output stdout=${out.trim() || "-"} stderr=${err.trim() || "-"}`);
  }

  return {
    commercialPromptPath: parsed.commercialPromptPath,
    negativePromptPath: parsed.negativePromptPath,
    storyboardPath: parsed.storyboardPath,
    _meta: metadata ? true : false
  };
};

export const tryGenerateCommercialPromptOutputs = async (args) => {
  try {
    const files = await generateCommercialPromptOutputs(args);
    return { success: true, files: { ...files, mode: "tsx" } };
  } catch (e) {
    try {
      const files = await tryRuntimeGeneration(args);
      return { success: true, files: { ...files, mode: "runtime" } };
    } catch (e2) {
      return { success: false, error: safeErrorMessage(e), fallbackError: safeErrorMessage(e2) };
    }
  }
};
