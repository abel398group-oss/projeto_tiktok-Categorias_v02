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

// Carrega o .env da raiz: este script fala com a API de analytics e precisa da
// ANALYTICS_API_KEY. Sem isto ia sem chave, levava 401 e concluía "0 produtos
// prontos" — indistinguível de "não há produto com galeria".
import "./load-root-env.mjs";
import { montarRoteiro } from "./lib/roteiro-video.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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
/*
 * 30 min nao chegavam. Medido em 30/08/2026: um video de 19 s a partir de 4
 * fotos ainda estava a renderizar aos 29 minutos, a ponte desistiu e escreveu
 * "0 video(s)" — e o ficheiro ficou pronto pouco depois. Desistir cedo nao
 * cancela nada do lado do gerador; so faz a ponte mentir sobre o resultado.
 *
 * O numero certo depende do gerador ser lento (MoviePy monta cada fotograma
 * em Python). Enquanto for esse o motor, 90 min e a margem honesta.
 */
const MAX_POLL_ATTEMPTS = 1080; // 90 min

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
/**
 * Quantas fotos por vídeo. Cada foto vira um clipe de `video_clip_duration`
 * (5 s), mas quem manda na duração final do vídeo é o ÁUDIO: o gerador usa
 * tantos clipes quantos couberem na narração e ignora o resto.
 *
 * Falta material e o gerador repete as mesmas fotos (`itertools.cycle`);
 * sobra material e paga-se ~3 min de conversão por foto que nunca aparece.
 *
 * Medido em 30/08/2026: o roteiro de `montarRoteiro` dá 18,43 s de áudio, que
 * a 5 s por clipe consome 4 fotos. Se mexer no roteiro, mexa aqui também.
 */
const maxFotos = Number(arg("fotos", 4));
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
  const minutos = Math.round((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60000);
  throw new Error(
    `o gerador ainda nao terminou depois de ${minutos} min. O render CONTINUA a correr ` +
    `do lado dele — o ficheiro pode aparecer sozinho em storage/tasks/${taskId}/final-1.mp4.`
  );
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

/**
 * Pasta de entrega, lida do `config.toml` do MoneyPrinterTurbo.
 *
 * Fonte única de propósito: o caminho já está configurado lá (é o que a página
 * Produtos usa) e duplicá-lo aqui garantia que um dia divergissem.
 */
async function pastaDeEntrega() {
  try {
    const toml = await fs.readFile(path.join(MONEY_HOME, "config.toml"), "utf8");
    const m = toml.match(/^\s*pasta_saida_videos\s*=\s*"(.+?)"\s*$/m);
    return m ? m[1].replace(/\\\\/g, "\\") : null;
  } catch {
    return null;
  }
}

/** Nome de ficheiro seguro no Windows: sem acento e sem `\ / : * ? " < > |`. */
function nomeSeguro(texto, limite) {
  return (
    String(texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, limite) || "produto"
  );
}

/** `.../c/nutrition-wellness/700646?...` → `nutrition-wellness` */
function slugDaCategoria(categoryUrl) {
  const m = String(categoryUrl ?? "").match(/\/c\/([^/?]+)/i);
  return m ? m[1] : "sem-categoria";
}

/**
 * Copia o vídeo para a pasta sincronizada e escreve o `.txt` ao lado.
 *
 * Sem isto o vídeo ficava em `storage/tasks/<uuid>/final-1.mp4` — nome opaco,
 * fora do Drive, na prática invisível para quem vai publicar. A página Produtos
 * já entregava assim; a ponte em lote não, e por isso o que ela gerava não
 * chegava a lado nenhum. Verificado em 29/08/2026: o primeiro vídeo gerado pela
 * ponte ficou órfão em storage/tasks.
 *
 * O `.txt` leva o LINK do produto e os números reais. Não gera texto de venda
 * com IA de propósito: quem faz isso é a página Produtos, e inventar aqui uma
 * segunda versão do argumento comercial criaria duas fontes a divergir.
 *
 * Falhar a entrega não derruba a corrida — o vídeo existe e o caminho fica
 * registado; o que se perde é a cópia, e isso diz-se em vez de rebentar.
 *
 * @returns {Promise<string | null>} caminho final, ou `null` se não deu
 */
async function entregarVideo(videoAbsoluto, produto) {
  const destino = await pastaDeEntrega();
  if (!destino) {
    log("  ⚠️ pasta_saida_videos não configurada — vídeo fica só em storage/tasks/");
    return null;
  }
  try {
    await fs.mkdir(destino, { recursive: true });
    const base = `${slugDaCategoria(produto.categoria_url)}__${nomeSeguro(produto.nome, 60)}`;
    const alvoVideo = path.join(destino, `${base}.mp4`);
    await fs.copyFile(videoAbsoluto, alvoVideo);
    await fs.writeFile(
      path.join(destino, `${base}.txt`),
      [
        produto.nome ?? "",
        "",
        `Preço: R$ ${Number(produto.preco).toFixed(2)}`,
        `Vendas: ${parseVendas(produto.vendas).toLocaleString("pt-BR")}`,
        "",
        `Link: ${produto.link_produto ?? ""}`,
        "",
        `Gerado em ${new Date().toLocaleString("pt-BR")} · product_id ${produto.product_id}`
      ].join("\n"),
      "utf8"
    );
    return alvoVideo;
  } catch (e) {
    log(`  ⚠️ falhou a cópia para ${destino}: ${e.message}`);
    return null;
  }
}

/** Chave e endereço da API de analytics (a mesma que o painel usa). */
const ANALYTICS_API = process.env.ANALYTICS_API_URL || "http://127.0.0.1:3333";
const ANALYTICS_KEY = process.env.ANALYTICS_API_KEY || "";

/**
 * Fotos do produto vindas da BASE, não do ficheiro da última coleta.
 *
 * O endpoint devolve a galeria mais recente que EXISTE para o produto, mesmo
 * que tenha sido capturada numa coleta anterior — é o mesmo caminho que o
 * painel e o Streamlit usam. Sem isto, produto enriquecido ficava invisível
 * assim que uma coleta de categoria nova reescrevia o consolidado.
 *
 * Devolve `[]` (e não lança) quando a API está fora ou o produto não existe:
 * a ponte deve saltar o produto, não morrer.
 *
 * @param {string} productId
 * @returns {Promise<string[]>}
 */
async function fotosDaBase(productId) {
  const pid = String(productId ?? "").trim();
  if (!pid) return [];
  try {
    const res = await fetch(`${ANALYTICS_API}/analytics/product-workspace/${encodeURIComponent(pid)}`, {
      headers: ANALYTICS_KEY ? { "x-api-key": ANALYTICS_KEY } : {}
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (Array.isArray(j?.imageUrls) ? j.imageUrls : [])
      .filter((u) => typeof u === "string" && u.startsWith("http"))
      // A galeria mistura ficheiros de vídeo do CDN; aqui só entram imagens.
      .filter((u) => !/\.(mp4|mov|mkv|avi)(\?|$)/i.test(u));
  } catch {
    return [];
  }
}

/**
 * Produtos com galeria na base, de qualquer coleta — o universo de candidatos.
 *
 * Falha alto de propósito: sem esta lista não há vídeo nenhum a fazer, e
 * seguir em silêncio para o ficheiro da última coleta era exactamente o
 * comportamento que escondia sete vídeos prontos.
 */
async function listarEnriquecidos() {
  const url = `${ANALYTICS_API}/analytics/enriched-products?minFotos=${MIN_FOTOS}&limit=500`;
  let res;
  try {
    res = await fetch(url, { headers: ANALYTICS_KEY ? { "x-api-key": ANALYTICS_KEY } : {} });
  } catch (e) {
    throw new Error(
      `API de análise inacessível em ${ANALYTICS_API} (${e?.message ?? e}). ` +
      "Suba-a com `npm run analytics` — é ela que sabe quais produtos têm galeria."
    );
  }
  if (!res.ok) {
    throw new Error(
      `API de análise respondeu ${res.status} em /analytics/enriched-products` +
      (res.status === 401 ? " — falta ANALYTICS_API_KEY no .env." : ".")
    );
  }
  const j = await res.json();
  return Array.isArray(j?.itens) ? j.itens : [];
}

/** Fotos do produto no ficheiro consolidado (fallback; ver `fotosDaBase`). */
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
  // `fotosResolvidas` vem da base (ver `fotosDaBase`); o ficheiro consolidado
  // só serve de rede de segurança para quem chame isto sem passar pela selecção.
  const urls = Array.isArray(produto?.fotosResolvidas) && produto.fotosResolvidas.length
    ? produto.fotosResolvidas
    : fotosDoProduto(produto);
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
      let buf = Buffer.from(await res.arrayBuffer());
      // Extensão real pela assinatura do ficheiro: o gerador rejeita material
      // sem extensão reconhecida, e a URL do CDN nem sempre a traz.
      let ext = ".jpg";
      const ehWebp = buf.slice(8, 12).toString() === "WEBP";
      if (buf[0] === 0x89 && buf[1] === 0x50) ext = ".png";
      else if (ehWebp) ext = ".webp";

      // WEBP quebra o MoneyPrinterTurbo: o MoviePy/ffmpeg dele trata .webp como
      // vídeo (sonda "duração" em vez de ler como imagem estática) e falha com
      // "At least one output file must be specified" — visto ao vivo em
      // 22/08/2026 gerando o vídeo do Pro3Magnésio. TikTok Shop serve fotos de
      // PDP quase sempre em WEBP, então sem isto a maioria dos produtos falha
      // silenciosamente na hora de gerar. Converter para JPEG aqui, antes de
      // entregar ao gerador, em vez de mexer no código de terceiros.
      if (ehWebp) {
        buf = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
        ext = ".jpg";
      }

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

  /*
   * OS CANDIDATOS VÊM DA BASE, NÃO DESTE FICHEIRO.
   *
   * `output/dados_produtos.json` é o consolidado da ÚLTIMA coleta, e cada
   * coleta reescreve-o. O enriquecimento (a visita à PDP que traz a galeria) é
   * caro e acontece uma vez, numa coleta qualquer — por isso um produto
   * enriquecido na semana passada desaparece deste ficheiro assim que corre
   * uma coleta que não o inclua, mesmo com as 10 fotos guardadas na base.
   *
   * Medido em 30/08/2026: 8 produtos enriquecidos na base, 7 com galeria boa,
   * e ZERO deles neste ficheiro — a ponte dizia "0 produtos prontos" com
   * material para sete vídeos guardado.
   *
   * Como só produto com galeria dá vídeo, a lista de enriquecidos JÁ É o
   * universo de candidatos: não há nada a filtrar de 6.000 para 40.
   */
  const enriquecidos = await listarEnriquecidos();
  const candidatos = enriquecidos
    .filter((e) => {
      const vendas = parseVendas(e.vendas);
      const temPreco = e.preco != null && parseFloat(e.preco) > 0;
      const temLink = typeof e.link === "string" && e.link.includes("tiktok.com");
      return vendas >= minVendas && temPreco && temLink;
    })
    .map((e) => ({
      product_id: e.productId,
      nome: e.nome,
      preco: e.preco,
      vendas: e.vendas,
      avaliacao_media: e.avaliacao_media,
      avaliacoes_total: e.avaliacoes_total,
      link_produto: e.link,
      categoria_url: e.categoryUrl,
      fotosNaBase: e.fotos
    }))
    // `video_gerado` continua a viver no ficheiro: é o histórico do que já saiu.
    .filter((e) => {
      const i = acharIndice(itens, e.product_id, e.link_produto);
      return i < 0 || !itens[i].video_gerado;
    });

  log(`Com galeria na base (qualquer coleta): ${enriquecidos.length}` +
      ` · candidatos (vendas ≥ ${minVendas}, ainda sem vídeo): ${candidatos.length}`);

  const porVendas = [...candidatos].sort((a, b) => parseVendas(b.vendas) - parseVendas(a.vendas));
  const qualificados = [];
  const semGaleria = [];

  for (const p of porVendas) {
    if (qualificados.length >= maxVideos) break;
    const fotos = await fotosDaBase(String(p.product_id ?? ""));
    if (fotos.length >= MIN_FOTOS) {
      qualificados.push({ ...p, fotosResolvidas: fotos });
    } else {
      // O endpoint já contou as fotos; cair aqui quer dizer que a galeria
      // encolheu entre as duas leituras. Raro, mas não é motivo para parar.
      semGaleria.push(p);
    }
  }

  log(`Prontos para vídeo (≥ ${MIN_FOTOS} fotos): ${qualificados.length}`);

  /*
   * A dica de "o que enriquecer a seguir" sai do ficheiro da última coleta —
   * é lá que estão os campeões de venda de HOJE, que é o que interessa
   * enriquecer. Aqui o ficheiro é a fonte certa; para candidatos, não era.
   */
  if (qualificados.length < maxVideos) {
    const jaTemos = new Set(enriquecidos.map((e) => String(e.productId)));
    const aEnriquecer = itens
      .filter((p) => {
        const temLink = typeof p.link_produto === "string" && p.link_produto.includes("tiktok.com");
        return parseVendas(p.vendas) >= minVendas && temLink && !jaTemos.has(String(p.product_id));
      })
      .sort((a, b) => parseVendas(b.vendas) - parseVendas(a.vendas))
      .slice(0, 3);

    if (aEnriquecer.length > 0) {
      log(`
⚠️  Faltam ${maxVideos - qualificados.length} produto(s) para o pedido.`);
      log("   A coleta de categoria só guarda a miniatura; a galeria vem do enriquecimento.");
      log("   Mais vendidos da última coleta ainda sem galeria:");
      for (const p of aEnriquecer) {
        log(`     npm run pdp:enrich -- --ids=${p.product_id}   # ${String(p.nome).slice(0, 45)}`);
      }
    }
  }

  if (semGaleria.length > 0) {
    log(`
(${semGaleria.length} produto(s) com galeria menor do que o esperado foram saltados.)`);
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
      log(`  [DRY-RUN] usaria ${Math.min((p.fotosResolvidas ?? []).length, maxFotos)} foto(s) do próprio produto (galeria da base)`);
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
          video_script: montarRoteiro(p, vendas),
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

      // O gerador devolve o caminho relativo ao `storage/` dele.
      const videoAbsoluto = path.join(MONEY_HOME, "storage", String(videoPath).replace(/^[/\\]+/, ""));
      const entregue = await entregarVideo(videoAbsoluto, p);
      if (entregue) log(`  📁 Entregue: ${entregue}`);

      // Casar pelo product_id, que é a chave real destes dados. A versão
      // anterior comparava `item.id`, campo que não existe aqui: `undefined ===
      // undefined` dá verdadeiro e o findIndex devolvia SEMPRE o índice 0,
      // carimbando o produto errado.
      const idx = acharIndice(itens, pid, p.link_produto);
      if (idx >= 0) {
        itens[idx].video_gerado = true;
        itens[idx].video_path = videoPath;
        itens[idx].video_entregue_em = entregue ?? null;
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
