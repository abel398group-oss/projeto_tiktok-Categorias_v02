/**
 * BRIDGE: TikTok Scraper → MoneyPrinterTurbo
 *
 * Lê produtos do scraper, filtra os bons, envia pro MoneyPrinterTurbo gerar vídeo.
 *
 * Uso:
 *   node scripts/send-to-money.mjs                    # processa todos produtos qualificados
 *   node scripts/send-to-money.mjs --max 5            # máx 5 vídeos
 *   node scripts/send-to-money.mjs --min-vendas 500   # filtro mínimo de vendas
 *   node scripts/send-to-money.mjs --dry-run          # só mostra o que faria
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "output", "dados_produtos.json");
const BRIDGE_LOG = path.join(ROOT, "output", "bridge-money.log");

const MONEY_API = "http://127.0.0.1:8080/api/v1";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 360; // 30 min

// Args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxVideos = Number(args.find(a => a.startsWith("--max="))?.split("=")[1] ?? 10);
const minVendas = Number(args.find(a => a.startsWith("--min-vendas="))?.split("=")[1] ?? 100);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFile(BRIDGE_LOG, line + "\n").catch(() => {});
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}: ${text}`);
  return data;
}

async function pollTask(taskId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const status = await fetchJson(`${MONEY_API}/tasks/${taskId}`);
    const state = status?.data?.state || status?.state;
    if (state === "success") return status.data;
    if (state === "failed") throw new Error(`Task failed: ${status?.data?.error || "unknown"}`);
    if (i % 12 === 0) log(`  ⏳ Task ${taskId} state: ${state} (${i * 5}s)`);
  }
  throw new Error("Timeout aguardando vídeo");
}

function parseVendas(v) {
  if (!v) return 0;
  const s = String(v).toLowerCase().trim();
  if (s.includes("k")) return Math.round(parseFloat(s) * 1000);
  if (s.includes("m")) return Math.round(parseFloat(s) * 1000000);
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

async function main() {
  log("=== Bridge Scraper → MoneyPrinterTurbo ===");

  // 1. Carregar produtos
  const raw = await fs.readFile(OUTPUT_FILE, "utf-8");
  const { itens = [] } = JSON.parse(raw);
  log(`Produtos carregados: ${itens.length}`);

  // 2. Filtrar qualificados
  const qualificados = itens
    .filter(p => {
      const vendas = parseVendas(p.vendas);
      const temPreco = p.preco && parseFloat(p.preco) > 0;
      const temLink = p.link_produto && p.link_produto.includes("tiktok.com");
      const temImagens = Array.isArray(p.fotos) && p.fotos.length > 0;
      return vendas >= minVendas && temPreco && temLink && temImagens;
    })
    .sort((a, b) => parseVendas(b.vendas) - parseVendas(a.vendas))
    .slice(0, maxVideos);

  log(`Qualificados (vendas ≥ ${minVendas}): ${qualificados.length}`);
  if (!qualificados.length) return;

  // 3. Processar cada um - usar índice no array original para persistir mudanças
  for (let i = 0; i < qualificados.length; i++) {
    const p = qualificados[i];
    const vendas = parseVendas(p.vendas);
    const nome = p.nome || p.title || `produto-${i}`;
    const preco = parseFloat(p.preco).toFixed(2);

    log(`\n[${i+1}/${qualificados.length}] ${nome} — ${vendas} vendas — R$ ${preco}`);

    if (dryRun) {
      log("  [DRY-RUN] Pularia envio");
      continue;
    }

    try {
      // Enviar pro MoneyPrinterTurbo
      const task = await fetchJson(`${MONEY_API}/videos`, {
        method: "POST",
        body: JSON.stringify({
          video_subject: `${nome} - Oferta TikTok Shop`,
          video_script: `Produto: ${nome}. Preço: R$ ${preco}. ${vendas} vendas. Compre pelo link na bio.`,
          video_aspect: "9:16",
          voice_name: "pt-BR-FranciscaNeural-Female",
          bgm_type: "random",
          font_name: "STHeitiMedium.ttc",
          text_fore_color: "#FFFFFF",
          stroke_color: "#000000",
          stroke_width: 1.5,
          font_size: 60,
          video_source: "search",
          video_concat_mode: "sequential",
          subtitle_enabled: true,
          n_threads: 2,
          video_terms: nome.split(" ").slice(0, 5).join(" ")
        })
      });

      const taskId = task.data?.task_id || task.task_id;
      log(`  📤 Task criada: ${taskId}`);

      // Poll até terminar
      const result = await pollTask(taskId);
      const videoPath = result?.video_path || result?.video;
      log(`  ✅ Vídeo pronto: ${videoPath}`);

      // Encontrar e atualizar no array ORIGINAL (itens) para persistir
      const idxOriginal = itens.findIndex(item => item.id === p.id || item.link_produto === p.link_produto);
      if (idxOriginal >= 0) {
        itens[idxOriginal].video_gerado = true;
        itens[idxOriginal].video_path = videoPath;
        itens[idxOriginal].video_task_id = taskId;
        itens[idxOriginal].video_gerado_em = new Date().toISOString();
      } else {
        log(`  ⚠️ Produto não encontrado no array original para persistir`);
      }

      // Salvar progresso incrementalmente
      await fs.writeFile(OUTPUT_FILE, JSON.stringify({ itens }, null, 2));
      log(`  💾 Progresso salvo`);

    } catch (e) {
      log(`  ❌ Erro: ${e.message}`);
      const idxOriginal = itens.findIndex(item => item.id === p.id || item.link_produto === p.link_produto);
      if (idxOriginal >= 0) {
        itens[idxOriginal].video_erro = e.message;
      }
      await fs.writeFile(OUTPUT_FILE, JSON.stringify({ itens }, null, 2));
    }
  }

  log("\n=== Bridge finalizado ===");
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});