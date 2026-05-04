/**
 * Se DATABASE_URL no .env ainda for o placeholder antigo (HOST:5432 / USER:PASSWORD),
 * substitui pela URI do Postgres Docker local deste repo (porta host 5433).
 * Chamado antes de prisma migrate nos comandos npm run db:docker:*.
 * Uso isolado: node scripts/ensure-local-database-url.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

const LOCAL =
  '"postgresql://tiktok_dev:tiktok_dev_local@127.0.0.1:5433/tiktok_shop_dev?schema=public"';

function isPlaceholderDatabaseUrl(line) {
  if (!/^\s*DATABASE_URL\s*=/.test(line)) return false;
  return (
    /@HOST:5432|USER:PASSWORD@HOST|:\/\/USER:PASSWORD@HOST/i.test(line) ||
    (/\/DATABASE\?/i.test(line) && /@HOST/i.test(line))
  );
}

if (!fs.existsSync(envPath)) {
  console.error("Falta .env na raiz. Corra: npm run setup:local");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const lines = raw.split(/\r?\n/);
let changed = false;
const out = lines.map((line) => {
  if (isPlaceholderDatabaseUrl(line)) {
    changed = true;
    return `DATABASE_URL=${LOCAL}`;
  }
  return line;
});

if (changed) {
  fs.writeFileSync(envPath, out.join("\n") + (raw.endsWith("\n") ? "" : "\n"), "utf8");
  console.log("DATABASE_URL actualizada para Postgres Docker local (127.0.0.1:5433).");
} else if (!/\bDATABASE_URL\s*=/.test(raw)) {
  fs.appendFileSync(
    envPath,
    `\nDATABASE_URL=${LOCAL}\n`,
    "utf8"
  );
  console.log("DATABASE_URL acrescentada (Postgres Docker local).");
}
