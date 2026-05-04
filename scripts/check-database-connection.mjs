/**
 * Testa DATABASE_URL → Prisma (`$connect` + `SELECT 1`).
 * Uso: npm run db:check (a partir da raiz; usa .env como os outros comandos).
 */
import { PrismaClient } from "@prisma/client";
import "./load-root-env.mjs";
import { requireDatabaseUrl } from "./analytics/_common.mjs";

requireDatabaseUrl();

const prisma = new PrismaClient({ log: [] });
try {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log("Ligação à base OK (Prisma conseguiu conectar e correr SELECT 1).");
} catch (e) {
  const msg = e && typeof e.message === "string" ? e.message : String(e);
  console.error("Falha ao ligar à base:", msg);
  if (/P1001|Can't reach|EHOSTUNREACH|ECONNREFUSED|timeout/i.test(msg)) {
    console.error("");
    console.error("Dicas:");
    console.error("- Confirma host/porta e ?sslmode=require se for Postgres gerido (ex. DigitalOcean).");
    console.error("- Na DO: Trusted sources deve incluir o teu IP actual (mudas de IP em redes móveis / reboot router).");
    console.error("- Se DATABASE_URL no .env ainda for o placeholder USER:PASSWORD@HOST → substituir pela URI real.");
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
