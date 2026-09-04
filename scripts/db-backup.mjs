/**
 * Backup do Postgres local (Docker) para um ficheiro restaurável.
 *
 * PORQUE EXISTE: a base vive num volume Docker, dentro da VM do WSL2 — o mesmo
 * componente que entrou em crash-loop nesta máquina em 22/08/2026 e obrigou a
 * apagar sockets corrompidos por dentro do WSL. Se aquele disco virtual
 * corromper, o volume vai com ele.
 *
 * E o `output/dados_produtos.json` NÃO é backup: guarda o estado de agora, sem
 * histórico. Medido em 03/09/2026 — banco com 57 305 produtos, 1 050 193
 * snapshots e 85 coletas desde 04/05; o JSON, 20 971 produtos e zero histórico.
 * Recoletar recupera o estado; NÃO recupera a série temporal, e é dela que sai
 * o `vendas/dia` — sem duas leituras afastadas, o ranking "em ascensão" morre.
 *
 * Formato `custom` (-Fc): comprimido e restaurável com `pg_restore`, seletivo
 * por tabela. Não é SQL de texto de propósito — 1 GB de INSERTs em texto é
 * lento de gerar e pior de restaurar.
 *
 * Uso:
 *   npm run db:backup                 # destino automático
 *   npm run db:backup -- --destino "D:\alguma\pasta"
 *   npm run db:backup -- --manter 10  # quantos ficheiros manter
 *
 * Restaurar (o contêiner tem de estar de pé):
 *   docker exec -i tiktok-shop-postgres-local pg_restore -U tiktok_dev \
 *     -d tiktok_shop_dev --clean --if-exists < ficheiro.dump
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const CONTENTOR = "tiktok-shop-postgres-local";
const UTILIZADOR = "tiktok_dev";
const BASE = "tiktok_shop_dev";

/**
 * Destinos por ordem de preferência.
 *
 * O Drive vem primeiro porque é o único que sobrevive à máquina morrer — que é
 * metade do motivo de haver backup. O disco local é rede de segurança: melhor
 * um backup no mesmo disco do que nenhum, desde que se diga que é isso.
 */
const DESTINOS = [
  { caminho: "I:\\Meu Drive\\backups-tiktok", rotulo: "Google Drive" },
  { caminho: path.join(ROOT, "backups"), rotulo: "pasta do projeto" }
];

/**
 * O destino sai da máquina?
 *
 * Não basta olhar para "é disco local": este repositório vive dentro do
 * OneDrive, por isso `backups/` na raiz do projeto TAMBÉM sincroniza para fora.
 * Dizer que "morre com o PC" seria falso, e um aviso falso ensina a ignorar
 * avisos. Só é local a sério o que não estiver debaixo de uma pasta que
 * sincroniza.
 *
 * @param {string} caminho
 */
function saiDaMaquina(caminho) {
  const c = caminho.toLowerCase();
  if (/^[a-z]:\\meu drive/.test(c) || c.includes("google drive")) return "Google Drive";
  if (c.includes("onedrive")) return "OneDrive";
  return null;
}

function arg(nome, omissao) {
  const argv = process.argv.slice(2);
  const comIgual = argv.find((a) => a.startsWith(`--${nome}=`));
  if (comIgual) return comIgual.split("=").slice(1).join("=");
  const i = argv.indexOf(`--${nome}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return omissao;
}

/** @returns {{caminho: string, rotulo: string} | null} */
function escolherDestino() {
  const forcado = arg("destino", "");
  if (forcado) return { caminho: forcado, rotulo: "indicado por --destino" };

  for (const d of DESTINOS) {
    // A raiz tem de existir: criar "I:\..." com o Drive fechado inventa uma
    // pasta num disco que não é o Drive, e o backup parece ter ido para a nuvem
    // quando não foi.
    const raiz = path.parse(d.caminho).root;
    if (!fs.existsSync(raiz)) continue;
    try {
      fs.mkdirSync(d.caminho, { recursive: true });
      return d;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

function contentorEstaDePe() {
  const r = spawnSync("docker", ["ps", "--filter", `name=${CONTENTOR}`, "--format", "{{.Names}}"], {
    encoding: "utf8"
  });
  return r.status === 0 && String(r.stdout || "").includes(CONTENTOR);
}

function main() {
  if (!contentorEstaDePe()) {
    console.error(`[backup] o contentor "${CONTENTOR}" não está a correr.`);
    console.error("[backup] sobe com: npm run db:docker:up");
    return 1;
  }

  const destino = escolherDestino();
  if (!destino) {
    console.error("[backup] nenhum destino utilizável. Indique um: --destino \"D:\\pasta\"");
    return 1;
  }

  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ficheiro = path.join(destino.caminho, `${BASE}-${carimbo}.dump`);

  console.log(`[backup] destino: ${destino.caminho}`);
  const sincroniza = saiDaMaquina(destino.caminho);
  if (sincroniza) {
    console.log(`[backup] ${destino.rotulo} — sincroniza para ${sincroniza}, sobrevive à perda do PC.`);
  } else {
    console.log(`[backup] ⚠  ${destino.rotulo} — NÃO sincroniza: este backup morre com o PC.`);
  }
  console.log("[backup] a exportar (pode demorar alguns minutos)…");

  // `-Fc` (custom) em vez de SQL de texto: comprime e permite restauro
  // seletivo. A saída vai por stdout para o ficheiro do lado do host — assim
  // não fica a ocupar espaço dentro do contentor.
  const saida = fs.openSync(ficheiro, "w");
  let r;
  try {
    r = spawnSync(
      "docker",
      ["exec", CONTENTOR, "pg_dump", "-U", UTILIZADOR, "-d", BASE, "-Fc"],
      { stdio: ["ignore", saida, "inherit"], maxBuffer: 1024 * 1024 * 1024 }
    );
  } finally {
    fs.closeSync(saida);
  }

  if (r.status !== 0) {
    // Um ficheiro truncado é pior do que nenhum: parece backup e não restaura.
    try { fs.unlinkSync(ficheiro); } catch { /* ok */ }
    console.error(`[backup] pg_dump falhou (código ${r.status}). Ficheiro parcial removido.`);
    return 1;
  }

  const mb = fs.statSync(ficheiro).size / 1024 / 1024;
  if (mb < 1) {
    try { fs.unlinkSync(ficheiro); } catch { /* ok */ }
    console.error(`[backup] saída suspeita (${mb.toFixed(2)} MB). Removido — não confie nisto.`);
    return 1;
  }
  console.log(`[backup] ✅ ${path.basename(ficheiro)} — ${mb.toFixed(0)} MB`);

  // Rotação: manter os N mais recentes.
  const manter = Math.max(1, Number(arg("manter", 5)) || 5);
  const antigos = fs
    .readdirSync(destino.caminho)
    .filter((f) => f.startsWith(`${BASE}-`) && f.endsWith(".dump"))
    .map((f) => ({ f, m: fs.statSync(path.join(destino.caminho, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(manter);

  for (const { f } of antigos) {
    try {
      fs.unlinkSync(path.join(destino.caminho, f));
      console.log(`[backup] removido antigo: ${f}`);
    } catch { /* ok */ }
  }

  console.log(`[backup] mantidos os ${manter} mais recentes.`);
  console.log("");
  console.log("Para restaurar:");
  console.log(`  docker exec -i ${CONTENTOR} pg_restore -U ${UTILIZADOR} -d ${BASE} --clean --if-exists < "${ficheiro}"`);
  return 0;
}

process.exit(main());
