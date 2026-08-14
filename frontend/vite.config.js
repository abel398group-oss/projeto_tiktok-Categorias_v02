import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Proxy: o browser pede ao Vite (/analytics/*); o Vite reencaminha para a API.
 * Evita CORS porque o fetch vai para o mesmo origin do dev server.
 */

/**
 * Navegação do browser não pode ir para a API.
 *
 * `/analytics` é ao mesmo tempo prefixo da API e rota do React Router. Sem esta
 * distinção, abrir http://localhost:5173/analytics na barra de endereços — ou
 * dar F5 estando nessa página, ou seguir um link guardado — devolvia 401 da API
 * em vez da página; só a navegação por dentro da app funcionava. Encontrado
 * pelo smoke test de rotas.
 *
 * O critério é o cabeçalho `Accept`: navegação pede `text/html`, `fetch()` de
 * dados não. Devolver um caminho faz o Vite servir a app em vez de reencaminhar.
 *
 * @param {import("node:http").IncomingMessage} req
 */
const naoDesviarNavegacao = (req) => {
  const aceita = String(req.headers?.accept ?? "");
  return aceita.includes("text/html") ? "/index.html" : null;
};

const alvoApi = {
  target: "http://127.0.0.1:3333",
  changeOrigin: true,
  bypass: naoDesviarNavegacao
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    /** Mantém sempre 5173: se estiver ocupada, o comando falha (evita abrir outra porta por engano e quebrar o proxy). Libertar: encerra outros `vite` ou `npx kill-port 5173`. */
    strictPort: true,
    proxy: {
      "/analytics": alvoApi,
      "/health": alvoApi,
      "/scrape": alvoApi
    }
  }
});
