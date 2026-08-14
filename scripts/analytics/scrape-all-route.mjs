/* eslint-disable no-console -- logs operacionais no terminal da API */
/**
 * Coleta de TODAS as categorias com parar/continuar (checkpoint).
 *
 * POST /scrape/all/start   → inicia (ou continua de onde parou) em segundo plano.
 *                            Body opcional: { reset?: bool, viewMoreMaxClicks?: number,
 *                            pauseMs?: number, pdpGallery?: bool }
 * POST /scrape/all/stop    → pede parada graciosa (cria flag). O processo encerra
 *                            antes da próxima categoria, fecha o Chrome e preserva o progresso.
 * GET  /scrape/all/status  → { running, completedCount, totalCount, remaining, percent,
 *                            currentLabel, stopping, done, lastExitCode }
 *
 * O processo filho grava o checkpoint após CADA categoria; reiniciar pula as concluídas.
 * Ao terminar (ou pausar), a rota roda consolidate para atualizar output/dados_*.json.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  CATALOG,
  loadCheckpoint,
  desistiuDe,
  readProgress,
  STOP_FLAG_FILE,
  OUTPUT_ROOT
} from "../scrape-all-categories.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const scrapeAllScript = path.join(repoRoot, "scripts", "scrape-all-categories.mjs");

/** @type {import("node:child_process").ChildProcess | null} */
let allChild = null;
let lastExitCode = null;
let startedAt = null;
let lastErrorTail = "";
let finalizing = false;
const ERR_TAIL_MAX = 4000;

/** O processo com este pid existe? (sinal 0 = só testa, não mata) */
function pidVivo(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A coleta está a correr?
 *
 * A referência em memória não chega: a API roda com `node --watch` e qualquer
 * edição a reinicia — o novo processo não conhece o filho antigo, dizia
 * "parado" com a coleta viva, e um segundo clique lançava um SEGUNDO Chrome
 * (a receita de captcha). Agora o processo da coleta é destacado, grava o
 * próprio pid no ficheiro de progresso, e aqui confere-se se o pid EXISTE —
 * verdade do sistema operativo, não memória de quem reiniciou.
 */
async function isRunningRobusto() {
  if (allChild !== null && allChild.exitCode === null && !allChild.killed) return true;
  const progresso = await readProgress().catch(() => null);
  return Boolean(progresso?.running) && pidVivo(Number(progresso?.pid));
}

// Consolidar+importar deixou de morar aqui: corre dentro do próprio processo
// da coleta (`--depois-importa` em scripts/scrape-all-categories.mjs), para
// sobreviver a reinícios da API.

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export function registerScrapeAllRoute(fastify) {
  fastify.post("/scrape/all/start", async (req, reply) => {
    if (await isRunningRobusto()) {
      return reply.code(409).send({ ok: false, error: "busy", message: "A coleta de todas as categorias já está a correr." });
    }

    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const reset = Boolean(/** @type {Record<string, unknown>} */ (body).reset);
    const rawClicks = Number(/** @type {Record<string, unknown>} */ (body).viewMoreMaxClicks);
    const rawPause = Number(/** @type {Record<string, unknown>} */ (body).pauseMs);
    const pdpGallery = Boolean(/** @type {Record<string, unknown>} */ (body).pdpGallery);

    // Remove flag de parada de execuções anteriores.
    try { await fs.unlink(STOP_FLAG_FILE); } catch { /* ok */ }

    const args = [scrapeAllScript, "--depois-importa"];
    if (reset) args.push("--reset");

    /** @type {Record<string, string>} */
    const env = { ...process.env };
    // Defaults anti-ban: mais "Ver mais" e pausa entre categorias.
    env.VIEW_MORE_MAX_CLICKS = Number.isFinite(rawClicks) && rawClicks >= 0 ? String(rawClicks) : (env.VIEW_MORE_MAX_CLICKS ?? "30");
    if (Number.isFinite(rawPause) && rawPause >= 0) env.PAUSE_BETWEEN_CATEGORIES_MS = String(rawPause);
    if (pdpGallery) { env.PDP_GALLERY = "1"; env.PDP_GALLERY_MAX = env.PDP_GALLERY_MAX ?? "25"; }

    console.log("[scrape:all] START reset=%s viewMore=%s pause=%s pdp=%s", reset, env.VIEW_MORE_MAX_CLICKS, env.PAUSE_BETWEEN_CATEGORIES_MS ?? "(auto 10-15s)", pdpGallery);

    startedAt = new Date().toISOString();
    lastExitCode = null;
    lastErrorTail = "";

    // Processo DESTACADO, com log em ficheiro em vez de pipes.
    //
    // A API roda com `node --watch`: editar um ficheiro do servidor reinicia-a,
    // e um filho preso por pipes morre junto — foi assim que uma coleta acabou
    // aos 3/212 sem deixar erro (08/08/2026). Destacado, com o pós-processamento
    // (`--depois-importa`) dentro do próprio filho, a coleta não depende da API
    // ficar de pé nem da página aberta.
    const logColeta = path.join(OUTPUT_ROOT, "scrape-all.log");
    await fs.mkdir(OUTPUT_ROOT, { recursive: true }).catch(() => {});
    const { openSync } = await import("node:fs");
    const fdLog = openSync(logColeta, "a");
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      detached: true,
      stdio: ["ignore", fdLog, fdLog]
    });
    child.unref();
    allChild = child;

    child.once("error", (e) => {
      console.error("[scrape:all] erro ao iniciar:", e?.message ?? e);
      allChild = null;
      lastExitCode = -1;
      lastErrorTail = String(e?.message ?? e);
    });
    // Bookkeeping quando a API sobrevive até ao fim; se ela reiniciar no meio,
    // o estado vem do ficheiro de progresso + pid (isRunningRobusto).
    child.once("close", async (code) => {
      lastExitCode = code ?? -1;
      allChild = null;
      if (code !== 0) {
        try {
          const tail = await fs.readFile(logColeta, "utf8");
          lastErrorTail = tail.slice(-ERR_TAIL_MAX);
        } catch {
          lastErrorTail = `coleta terminou com código ${code} (log: output/scrape-all.log)`;
        }
      } else {
        lastErrorTail = "";
      }
      console.log("[scrape:all] processo terminou exitCode=%s (consolidar+importar corre no próprio filho)", code);
    });

    return reply.send({ ok: true, running: true, message: "Coleta de todas as categorias iniciada. Acompanhe o progresso no painel." });
  });

  fastify.post("/scrape/all/stop", async (_req, reply) => {
    if (!(await isRunningRobusto())) {
      return reply.send({ ok: true, running: false, message: "Nenhuma coleta em curso." });
    }
    await fs.mkdir(OUTPUT_ROOT, { recursive: true }).catch(() => {});
    await fs.writeFile(STOP_FLAG_FILE, new Date().toISOString(), "utf8");
    console.log("[scrape:all] STOP solicitado — parará antes da próxima categoria.");
    return reply.send({ ok: true, running: true, stopping: true, message: "Parada solicitada. Vai encerrar após a categoria atual — o progresso é preservado." });
  });

  fastify.get("/scrape/all/status", async (_req, reply) => {
    const running = await isRunningRobusto();
    const { completed, failures } = await loadCheckpoint();
    const total = CATALOG.length;
    const completedCount = completed.size;
    // Categoria que falhou NÃO conta como concluída — senão o painel diz 100%
    // com buraco na base. As que esgotaram tentativas saem da fila, mas
    // aparecem à parte para o utilizador saber o que ficou por colher.
    const failedList = Object.entries(failures ?? {})
      .map(([url, f]) => ({ url, ...f }))
      .sort((a, b) => Number(b.tentativas ?? 0) - Number(a.tentativas ?? 0));
    const gaveUp = failedList.filter((f) => desistiuDe(failures, f.url));
    const resolvidas = completedCount + gaveUp.length;
    const progress = await readProgress();
    let stopping = false;
    try { await fs.access(STOP_FLAG_FILE); stopping = running; } catch { stopping = false; }

    return reply.send({
      ok: true,
      running,
      startedAt: running ? startedAt : (progress?.startedAt ?? null),
      completedCount,
      totalCount: total,
      remaining: Math.max(0, total - resolvidas),
      percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      currentLabel: running ? (progress?.currentLabel ?? null) : null,
      currentIndex: progress?.currentIndex ?? completedCount,
      stopping,
      finalizing,
      done: resolvidas >= total,
      failedCount: failedList.length,
      gaveUpCount: gaveUp.length,
      failed: failedList.slice(0, 30),
      stoppedByUser: !running && Boolean(progress?.stoppedByUser),
      lastExitCode,
      // Motivo de falha (só quando terminou mal e não foi parada do utilizador).
      lastError:
        !running && lastExitCode != null && lastExitCode !== 0 && !progress?.stoppedByUser
          ? (lastErrorTail || "").slice(-1200)
          : ""
    });
  });
}
