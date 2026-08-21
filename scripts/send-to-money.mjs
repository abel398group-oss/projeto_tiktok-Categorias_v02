/**
 * PONTE: TikTok Scraper → MoneyPrinterTurbo
 *
 * Lê produtos do scraper, baixa as FOTOS DO PRÓPRIO PRODUTO e manda o
 * MoneyPrinterTurbo montar o vídeo com elas.
 *
 * A regra que manda em tudo aqui: o vídeo leva o link de afiliado do produto,
 * logo TEM de mostrar aquele produto. A versão anterior deste script pedia
 * `video_source: "search"`, que faz o gerador buscar filmagem genérica num
 * banco de imagens usando o nome do produto como termo — o vídeo saía com a
 * creatina (ou o body) DE OUTRA PESSOA e o link do utilizador. Isso é anúncio
 * enganoso, com risco de derrubar a conta; não é só um vídeo pior.
 *
 * Uso:
 *   node scripts/send-to-money.mjs --dry-run          # mostra o que faria
 *   node scripts/send-to-money.mjs --max 5            # no máximo 5 vídeos
 *   node scripts/send-to-money.mjs --min-vendas 500   # filtro de vendas
 *
 * Requisitos: a API do MoneyPrinterTurbo a correr (porta 8080) —
 * `python main.py` na pasta dele. O Streamlit (8501) é outra coisa e não serve.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT, "output", "dados_produtos.json");
const BRIDGE_LOG = path.join(ROOT, "output", "bridge-money.log");

/** Pasta do MoneyPrinterTurbo (o material local tem de ficar lá dentro). */
const MONEY_HOME =
  process.env.MONEY_HOME ||
  path.join(path.dirname(path.dirname(ROOT)), "MoneyPrinterTurbo");
/**
 * Material local só é aceite dentro de `storage/local_videos` — o
 * MoneyPrinterTurbo valida o caminho e descarta em silêncio o que estiver fora,
 * terminando com "no valid local video materials were found".
 */
const MATERIAL_ROOT = path.join(MONEY_HOME, "storage", "local_videos", "produtos");

const MONEY_API = process.env.MONEY_API || "http://127.0.0.1:8080/api/v1";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 360; // 30 min

/** Aceita `--flag valor` e `--flag=valor` — a documentação prometia as duas. */
function arg(nome, omissao) {
  const args = process.argv.slice(2);
  const comIgual = args.find((a) => a.startsWith(`--${nome}=`));
  if (comIgual) return comIgual.split("=").slice(1).join("=");
  const i = args.indexOf(`--${nome}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  return omissao;
}

const dryRun = process.argv.includes("--dry-run");
const maxVideos = Number(arg("max", 10));
const minVendas = Number(arg("min-vendas", 100));
/** Quantas fotos por vídeo. Cada foto vira ~5 s de clipe. */
const maxFotos = Number(arg("fotos", 6));
/**
 * Fotos mínimas para valer a pena gerar.
 *
 * A coleta de categoria só guarda a miniatura — UMA foto por produto. Um vídeo
 * feito com uma foto é a mesma imagem parada do princípio ao fim, exatamente o
 * que o TikTok rebaixa como "imagem estática". A galeria de verdade só aparece
 * depois de enriquecer o produto (`npm run pdp:enrich -- --ids=<id>`), e é por
 * isso que estes ficam de fora em vez de virarem vídeo fraco.
 */
const MIN_FOTOS = Number(arg("min-fotos", 3));

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
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await fetchJson(`${MONEY_API}/tasks/${taskId}`);
    const state = status?.data?.state ?? status?.state;
    if (state === "success" || state === 1) return status.data ?? status;
    if (state === "failed" || state === -1) {
      throw new Error(`o gerador reportou falha: ${status?.data?.error || "sem detalhe"}`);
    }
    if (i % 12 === 0) log(`  ⏳ ${taskId} · estado ${state} (${i * 5}s)`);
  }
  throw new Error("Timeout aguardando vídeo");
}

function parseVendas(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).toLowerCase().trim();
  if (s.includes("k")) return Math.round(parseFloat(s) * 1000);
  if (s.includes("m")) return Math.round(parseFloat(s) * 1000000);
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Fotos do produto, preferindo as da página de produto (maiores). */
function fotosDoProduto(p) {
  const lista = Array.isArray(p?.fotos_pdp) && p.fotos_pdp.length ? p.fotos_pdp : p?.fotos;
  return (Array.isArray(lista) ? lista : []).filter(
    (u) => typeof u === "string" && u.startsWith("http")
  );
}

/**
 * Baixa as fotos do produto para dentro do MoneyPrinterTurbo.
 *
 * O CDN do TikTok devolve 403 sem `Referer` da loja. Foto que falhe é saltada:
 * cinco fotos boas fazem vídeo; parar tudo por causa de uma não faz sentido.
 *
 * @returns {Promise<string[]>} caminhos locais absolutos
 */
async function baixarFotos(produto, destino, limite) {
  const urls = fotosDoProduto(produto);
  if (urls.length === 0) return [];
  await fs.mkdir(destino, { recursive: true });

  const caminhos = [];
  for (const url of urls.slice(0, limite)) {
    try {
      const res = await fetch(url, {
        headers: {
          Referer: "https://shop.tiktok.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) { log(`    foto ignorada (HTTP ${res.status})`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // Extensão real pela assinatura do ficheiro: o gerador rejeita material
      // sem extensão reconhecida, e a URL do CDN nem sempre a traz.
      let ext = ".jpg";
      if (buf[0] === 0x89 && buf[1] === 0x50) ext = ".png";
      else if (buf.slice(8, 12).toString() === "WEBP") ext = ".webp";
      const caminho = path.join(destino, `foto-${caminhos.length + 1}${ext}`);
      await fs.writeFile(caminho, buf);
      caminhos.push(caminho);
    } catch (e) {
      log(`    foto ignorada (${e.message})`);
    }
  }
  return caminhos;
}

/** Índice do produto no ficheiro, pela chave real destes dados. */
function acharIndice(itens, pid, link) {
  return itens.findIndex(
    (it) => (pid && String(it.product_id) === pid) || (link && it.link_produto === link)
  );
}

async function main() {
  log("=== Ponte Scraper → MoneyPrinterTurbo ===");

  const raw = await fs.readFile(OUTPUT_FILE, "utf-8");
  /** Payload inteiro: os metadados (coletado_em, total, status…) têm de ser
   *  preservados na gravação — a versão anterior gravava só `{ itens }` e
   *  destruía o resto do ficheiro consolidado. */
  const payload = JSON.parse(raw);
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  log(`Produtos carregados: ${itens.length}`);

  /** Passa em tudo menos, talvez, no número de fotos. */
  const candidatos = itens.filter((p) => {
    const vendas = parseVendas(p.vendas);
    const temPreco = p.preco != null && parseFloat(p.preco) > 0;
    const temLink = typeof p.link_produto === "string" && p.link_produto.includes("tiktok.com");
    return vendas >= minVendas && temPreco && temLink && !p.video_gerado;
  });

  const semGaleria = candidatos.filter((p) => fotosDoProduto(p).length < MIN_FOTOS);
  const qualificados = candidatos
    .filter((p) => fotosDoProduto(p).length >= MIN_FOTOS)
    .sort((a, b) => parseVendas(b.vendas) - parseVendas(a.vendas))
    .slice(0, maxVideos);

  log(`Candidatos (vendas ≥ ${minVendas}, com preço e link): ${candidatos.length}`);
  log(`Prontos para vídeo (≥ ${MIN_FOTOS} fotos): ${qualificados.length}`);

  if (semGaleria.length > 0) {
    log(`\n⚠️  ${semGaleria.length} produto(s) ficaram de fora por terem menos de ${MIN_FOTOS} fotos.`);
    log("   A coleta de categoria só guarda a miniatura; a galeria vem do enriquecimento.");
    log("   Para os 3 melhores:");
    for (const p of semGaleria.sort((a, b) => parseVendas(b.vendas) - parseVendas(a.vendas)).slice(0, 3)) {
      log(`     npm run pdp:enrich -- --ids=${p.product_id}   # ${String(p.nome).slice(0, 45)}`);
    }
  }

  if (!qualificados.length) {
    log("\nNada a gerar: enriqueça alguns produtos primeiro (comandos acima) e volte a correr.");
    return;
  }

  if (!dryRun) {
    try {
      await fs.access(MONEY_HOME);
    } catch {
      throw new Error(
        `MoneyPrinterTurbo não encontrado em ${MONEY_HOME}. Defina MONEY_HOME=<pasta> ou use --dry-run.`
      );
    }
  }

  for (let i = 0; i < qualificados.length; i++) {
    const p = qualificados[i];
    const vendas = parseVendas(p.vendas);
    const nome = p.nome || `produto-${i}`;
    const preco = parseFloat(p.preco).toFixed(2);
    const pid = String(p.product_id ?? "");

    log(`\n[${i + 1}/${qualificados.length}] ${nome.slice(0, 60)} — ${vendas} vendas — R$ ${preco}`);

    if (dryRun) {
      log(`  [DRY-RUN] usaria ${Math.min(fotosDoProduto(p).length, maxFotos)} foto(s) do próprio produto`);
      continue;
    }

    try {
      const destino = path.join(MATERIAL_ROOT, pid || `sem-id-${i}`);
      const fotos = await baixarFotos(p, destino, maxFotos);
      if (fotos.length === 0) {
        throw new Error("nenhuma foto do produto pôde ser baixada (CDN recusou ou expirou)");
      }
      log(`  🖼  ${fotos.length} foto(s) do produto prontas`);

      const task = await fetchJson(`${MONEY_API}/videos`, {
        method: "POST",
        body: JSON.stringify({
          video_subject: nome,
          video_script:
            `${nome}. ${vendas.toLocaleString("pt-BR")} pessoas já compraram. ` +
            "Veja o link na loja do perfil.",
          // As fotos DO PRODUTO são o material. Nunca "search": o vídeo leva o
          // link deste produto e tem de mostrar este produto.
          video_source: "local",
          video_materials: fotos.map((c) => ({ provider: "local", url: c, duration: 0 })),
          video_aspect: "9:16",
          video_concat_mode: "sequential",
          // Zoom lento em foto parada: o TikTok rebaixa "imagens estáticas".
          video_transition_mode: "ZoomIn",
          video_clip_duration: 5,
          voice_name: "pt-BR-FranciscaNeural-Female",
          // Sem trilha: a narração é o argumento de venda e a música disputa com ela.
          bgm_type: "",
          // Fonte com acentuação latina — a anterior (STHeitiMedium) é chinesa
          // e não desenha "ã/ç" de forma fiável.
          font_name: "MicrosoftYaHeiBold.ttc",
          text_fore_color: "#FFFFFF",
          stroke_color: "#000000",
          stroke_width: 1.5,
          font_size: 60,
          subtitle_enabled: true,
          n_threads: 2
        })
      });

      const taskId = task.data?.task_id || task.task_id;
      log(`  📤 Tarefa criada: ${taskId}`);

      const result = await pollTask(taskId);
      const videoPath = result?.videos?.[0] || result?.video_path || result?.video;
      log(`  ✅ Vídeo pronto: ${videoPath}`);

      // Casar pelo product_id, que é a chave real destes dados. A versão
      // anterior comparava `item.id`, campo que não existe aqui: `undefined ===
      // undefined` dá verdadeiro e o findIndex devolvia SEMPRE o índice 0,
      // carimbando o produto errado.
      const idx = acharIndice(itens, pid, p.link_produto);
      if (idx >= 0) {
        itens[idx].video_gerado = true;
        itens[idx].video_path = videoPath;
        itens[idx].video_task_id = taskId;
        itens[idx].video_gerado_em = new Date().toISOString();
        delete itens[idx].video_erro;
      } else {
        log("  ⚠️ produto não encontrado no ficheiro para registar o vídeo");
      }
      await fs.writeFile(OUTPUT_FILE, JSON.stringify({ ...payload, itens }, null, 2));
      log("  💾 Registado");
    } catch (e) {
      log(`  ❌ ${e.message}`);
      const idx = acharIndice(itens, pid, p.link_produto);
      if (idx >= 0) itens[idx].video_erro = e.message;
      await fs.writeFile(OUTPUT_FILE, JSON.stringify({ ...payload, itens }, null, 2));
    }
  }

  const ok = itens.filter((i) => i.video_gerado).length;
  log(`\n=== Fim: ${ok} vídeo(s) com as fotos do próprio produto ===`);
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
