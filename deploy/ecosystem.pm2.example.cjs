/**
 * PM2 — exemplo estável para `analytics-api` (sem NPM / NVM no arranque).
 *
 * 1. Copiar e editar caminhos + interpreter:
 *      cp deploy/ecosystem.pm2.example.cjs ecosystem.config.cjs
 *      nano ecosystem.config.cjs
 *
 * 2. Definir `interpreter`: caminho ABSOLUTO do Node (critério — evita crash em loop).
 *    - Node instalado com apt / NodeSource: em geral /usr/bin/node
 *          command -v node
 *    - NVM: mesmo utilizador onde corre o PM2, depois de `nvm use`:
 *          command -v node
 *          (ex.: /root/.nvm/versions/node/v22.x.x/bin/node)
 *
 * 3. Arranque:
 *      cd /CAMINHO/DO/CLONE
 *      pm2 delete analytics-api 2>/dev/null
 *      pm2 start ecosystem.config.cjs
 *      pm2 save
 *      pm2 startup   # seguir instrução impressa uma vez
 *
 * `--import ./scripts/load-root-env.mjs`: carrega `.env` na raiz se existir (alinhado a `npm run analytics:api`; evita que o Node falhe se `.env` ainda não foi criado — o processo continua a exigir variáveis válidas para subir a API).
 */
module.exports = {
  apps: [
    {
      name: "analytics-api",
      cwd: "/opt/projeto_tiktok-Categorias_v02",
      script: "scripts/analytics/server.mjs",
      interpreter: "/usr/bin/node",
      node_args: "--import ./scripts/load-root-env.mjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      watch: false
    }
  ]
};
