/**
 * Espera até `host:port` aceitar TCP (ex.: Postgres a arrancar no Docker).
 * Uso: node scripts/wait-tcp.mjs [host] [port] [timeoutMs]
 */
import net from "node:net";

const host = process.argv[2] ?? "127.0.0.1";
const port = Number(process.argv[3] ?? "5433");
const maxMs = Number(process.argv[4] ?? "60000");

if (!Number.isFinite(port) || port <= 0) {
  console.error("Porta inválida");
  process.exit(1);
}

function tryOnce() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      resolve(undefined);
    });
    socket.on("error", reject);
    socket.setTimeout(2000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
  });
}

const started = Date.now();
console.error(`À espera de ${host}:${port} …`);
while (Date.now() - started < maxMs) {
  try {
    await tryOnce();
    console.error(`OK: ${host}:${port} acessível.`);
    process.exit(0);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
  }
}
console.error(`Timeout (${maxMs} ms) à espera de ${host}:${port}. Docker a correr? npm run db:docker:up`);
process.exit(1);
