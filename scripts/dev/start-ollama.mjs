import { spawn } from "node:child_process";

const OLLAMA_URL = "http://127.0.0.1:11434/api/tags";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isOllamaRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const res = await fetch(OLLAMA_URL, { signal: controller.signal });
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  try {
    const running = await isOllamaRunning();
    if (running) {
      console.log("[dev:ollama] Ollama already running on localhost:11434");
      return;
    }

    try {
      const child = spawn("ollama", ["serve"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        shell: true
      });
      child.unref();
      console.log("[dev:ollama] Started 'ollama serve' in background");
    } catch (e) {
      console.warn(`[dev:ollama] Failed to start 'ollama serve': ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    for (let i = 0; i < 10; i++) {
      await sleep(400);
      if (await isOllamaRunning()) {
        console.log("[dev:ollama] Ollama is online");
        return;
      }
    }

    console.warn("[dev:ollama] Ollama did not become available on localhost:11434; continuing without it");
  } catch (e) {
    console.warn(`[dev:ollama] Warning: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main();
