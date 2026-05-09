/**
 * Pré-carregamento para `node --import`: lê `.env` na raiz do repo **se existir**.
 * Substitui `node --env-file=.env`, que em Node 20+ termina com erro quando o ficheiro falta.
 *
 * Carrega **apenas** `.env` (sem `override`, sem segundo ficheiro): o mesmo comportamento estável
 * desde a introdução deste script. Um `.env.local` a seguir com `override` podia apagar `SPACES_*`
 * válidos do `.env` se o local tivesse chaves vazias — sintoma: export ao Space **503** «em falta no .env».
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
