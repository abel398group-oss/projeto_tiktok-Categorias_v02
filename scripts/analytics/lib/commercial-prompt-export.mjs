import { spawn } from "node:child_process";

const safeErrorMessage = (e) => (e instanceof Error ? e.message : String(e));

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
    return { success: true, files };
  } catch (e) {
    return { success: false, error: safeErrorMessage(e) };
  }
};
