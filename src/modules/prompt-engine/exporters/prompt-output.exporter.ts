import * as path from "node:path";
import { stat, writeFile } from "node:fs/promises";
import type { PromptFiles } from "../interfaces/prompt-files.interface";

export interface PromptOutputExportResult {
  commercialPromptPath: string;
  negativePromptPath: string;
  storyboardPath: string;
}

export class PromptOutputExporter {
  static async exportToProductDir(productDir: string, promptFiles: PromptFiles): Promise<PromptOutputExportResult> {
    const st = await stat(productDir);
    if (!st.isDirectory()) {
      throw new Error(`productDir_not_directory: ${productDir}`);
    }

    const commercialPromptPath = path.join(productDir, "commercial-prompt.txt");
    const negativePromptPath = path.join(productDir, "negative-prompt.txt");
    const storyboardPath = path.join(productDir, "storyboard.json");

    await writeFile(commercialPromptPath, `${promptFiles.commercialPrompt}\n`, "utf8");
    await writeFile(negativePromptPath, `${promptFiles.negativePrompt}\n`, "utf8");
    await writeFile(storyboardPath, `${JSON.stringify(promptFiles.storyboard, null, 2)}\n`, "utf8");

    return { commercialPromptPath, negativePromptPath, storyboardPath };
  }
}

