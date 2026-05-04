/**
 * Primeira vez no clone: copia `.env.example` → `.env` e `frontend/.env.example` → `frontend/.env` se faltarem.
 * Uso: npm run setup:local
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function copyIfMissing(from, to, label) {
  if (fs.existsSync(to)) {
    console.log(`${label}: já existe — ignorado.`);
    return false;
  }
  if (!fs.existsSync(from)) {
    console.error(`${label}: ficheiro modelo em falta: ${path.relative(root, from)}`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
  console.log(`${label}: criado a partir do exemplo.`);
  return true;
}

const createdRoot = copyIfMissing(
  path.join(root, ".env.example"),
  path.join(root, ".env"),
  ".env (raiz)"
);
const createdFe = copyIfMissing(
  path.join(root, "frontend", ".env.example"),
  path.join(root, "frontend", ".env"),
  "frontend/.env"
);

if (createdRoot || createdFe) {
  console.log("");
  console.log("Postgres local (Docker): npm run db:docker:up && npm run db:docker:bootstrap");
  console.log("Depois npm run db:check e npm run dev:all (ver FLUXO.md).");
  console.log(
    "ANALYTICS_API_KEY deve coincidir com VITE_ANALYTICS_API_KEY em frontend/.env (exemplos já alinhados)."
  );
}

const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  const line =
    raw.split("\n").find((l) => /^\s*DATABASE_URL\s*=/.test(l)) ?? "";
  if (/@HOST:5432|USER:PASSWORD@HOST/i.test(line)) {
    console.warn("");
    console.warn("Aviso: DATABASE_URL ainda parece o modelo antigo (HOST / USER:PASSWORD).");
    console.warn("Para Postgres local: copia a DATABASE_URL mais recente de .env.example (porta 5433) ou corre npm run db:docker:bootstrap.");
    console.warn("");
  }
}
