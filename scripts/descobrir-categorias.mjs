/**
 * Descobre categorias do TikTok Shop BR e compara com o catálogo local.
 *
 * Responde à pergunta "são mesmo só 212?": abre UMA página (o diretório
 * /br/c), extrai todos os links de categoria e mostra a diferença contra o
 * CATALOG — o que o TikTok tem e nós não, e o que temos e o TikTok já tirou.
 *
 * Por que não é automático: o TikTok bloqueia qualquer requisição sem
 * navegador (até o robots.txt devolve Security Check — medido em 08/08/2026),
 * e um navegador extra durante uma coleta é a receita conhecida de captcha.
 * Por isso este script (1) recusa-se a correr com coleta em andamento e
 * (2) visita uma única página, sem cliques em série.
 *
 * USO (com a coleta parada):
 *   npm run descobrir:categorias              # headless, usa a sessão do perfil
 *   cross-env HEADED=1 npm run descobrir:categorias   # com janela (se pedir puzzle)
 */
import fs from "node:fs/promises";
import { CATALOG, readProgress } from "./scrape-all-categories.mjs";
import { launchTikTokBrowser, installAntiPopupGuards } from "../src/scrapeCategory.mjs";

const DIRETORIO = "https://shop.tiktok.com/br/c";

async function main() {
  // Trava: dois navegadores no mesmo IP durante a coleta acaba em captcha
  // para os dois. Melhor recusar do que estragar uma coleta de horas.
  const progresso = await readProgress();
  if (progresso?.running) {
    console.error(
      "❌ Há uma coleta em andamento (" +
        `${progresso.completedCount}/${progresso.totalCount}). ` +
        "Rodar a descoberta agora seria um segundo Chrome no mesmo IP — espere a coleta acabar."
    );
    return 2;
  }

  console.log("A abrir o diretório de categorias (uma página só)…");
  const browser = await launchTikTokBrowser();
  try {
    const page = await browser.newPage();
    await installAntiPopupGuards(browser, page);
    await page.goto(DIRETORIO, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Deixa o lazy-load assentar; sem cliques, sem rolagem agressiva.
    await new Promise((r) => setTimeout(r, 4000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 2500));

    const titulo = await page.title();
    if (/security check|verify/i.test(titulo)) {
      console.error(
        "❌ O TikTok pediu verificação. Rode com janela para resolver o puzzle uma vez:\n" +
          "   npx cross-env HEADED=1 node scripts/descobrir-categorias.mjs"
      );
      return 3;
    }

    /** Todos os links /br/c/<slug>/<id> presentes no diretório. */
    const achadas = await page.evaluate(() => {
      const mapa = new Map();
      for (const a of document.querySelectorAll("a[href]")) {
        const m = a.href.match(/\/br\/c\/([a-z0-9-]+)\/(\d+)/i);
        if (!m) continue;
        const chave = `${m[1]}/${m[2]}`;
        const texto = (a.textContent || "").trim().slice(0, 60);
        if (!mapa.has(chave) || (texto && !mapa.get(chave))) mapa.set(chave, texto);
      }
      return [...mapa.entries()].map(([chave, rotulo]) => ({ chave, rotulo }));
    });

    if (achadas.length === 0) {
      console.error(
        "❌ Nenhum link de categoria na página — ou o layout mudou, ou a sessão caiu. " +
          "Confira com HEADED=1."
      );
      return 1;
    }

    const nossas = new Set(CATALOG.map((c) => `${c.slug}/${c.id}`));
    const doTikTok = new Set(achadas.map((a) => a.chave));

    const novas = achadas.filter((a) => !nossas.has(a.chave));
    const sumidas = CATALOG.filter((c) => !doTikTok.has(`${c.slug}/${c.id}`));

    console.log(`\nDiretório do TikTok: ${achadas.length} categorias · nosso catálogo: ${CATALOG.length}`);

    if (novas.length > 0) {
      console.log(`\n🆕 No TikTok e FORA do nosso catálogo (${novas.length}):`);
      for (const n of novas) console.log(`  { label: "${n.rotulo || n.chave}", slug: "${n.chave.split("/")[0]}", id: "${n.chave.split("/")[1]}" },`);
      console.log("\n→ Cole as linhas acima no CATALOG de scripts/scrape-all-categories.mjs.");
    } else {
      console.log("\n✅ Nenhuma categoria nova — o catálogo cobre tudo o que o diretório mostra.");
    }

    if (sumidas.length > 0) {
      console.log(`\n⚠️  No nosso catálogo mas NÃO no diretório (${sumidas.length}) — possivelmente descontinuadas (nota: o diretório pode não listar tudo; confirme antes de remover):`);
      for (const s of sumidas) console.log(`  • ${s.label} (${s.slug}/${s.id})`);
    }

    await fs.writeFile(
      "output/categorias-descobertas.json",
      JSON.stringify({ verificado_em: new Date().toISOString(), doTikTok: achadas, novas, sumidas }, null, 2),
      "utf8"
    );
    console.log("\nGravado em output/categorias-descobertas.json");
    return 0;
  } finally {
    await browser.close().catch(() => {});
  }
}

const code = await main();
process.exit(typeof code === "number" ? code : 0);
