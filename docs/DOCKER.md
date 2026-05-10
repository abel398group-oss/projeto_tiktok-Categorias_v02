# Deploy com Docker (modo simples)

**Desenvolvimento:** Postgres só no PC — `docker-compose.postgres-local.yml` e `npm run db:docker:*` (ver `FLUXO.md`); **não** é o mesmo ficheiro que o stack abaixo.

Um contentor corre a **API** (Node + Prisma); outro o **Nginx** com o build do **React** e proxy de **`/analytics`**, **`/scrape`** e **`/health`** para a API (`deploy/nginx-docker.conf`).

A imagem **`Dockerfile.api`** inclui o pacote Debian **`chromium`** e bibliotecas para headless, com **`PUPPETEER_SKIP_DOWNLOAD=1`** (sem Chrome empacotado pelo npm) e **`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`**. O scraper (`src/scrapeCategory.mjs`) usa `executablePath` quando essa variável está definida (também podes sobrescrever no `.env` do Easypanel).

### Ficheiros Compose

| Ficheiro | Uso |
|----------|-----|
| `docker-compose.yml` | Stack base: **sem** `ports` no host (`expose` apenas). **EasyPanel**, Traefik ou outro proxy que ligue à rede Docker ao contentor **`web`**, porta interna **80**. |
| `docker-compose.local.yml` | Sobreposição opcional: publica **`${COMPOSE_WEB_PORT:-8080}:80`** no host (PC, VM, Droplet sem proxy). |
| `docker-compose.easypanel.yml` | Apenas `include` do `docker-compose.yml` (Compose **v2.24+**). Se o teu `docker compose` for mais antigo, aponta o painel directamente para **`docker-compose.yml`**. |

O stack base define **`depends_on: api → condition: service_healthy`** e *healthchecks* na `api` (Node `fetch` em `/health`) e no `web` (Nginx + `wget` ao `/health`).

## Requisitos

- **Docker** + **Docker Compose** v2 (plugin `docker compose`) no servidor; **EasyPanel com `include`:** Compose **≥ 2.24** (ou usar só `docker-compose.yml`).
- **PostgreSQL** acessível a partir do Droplet (ex.: Managed DB na DigitalOcean). Em **Trusted sources**, permite o **Droplet** (IP ou recurso VPC).
- Ficheiro **`.env`** na raiz do clone (copiar de `.env.example` e preencher).

No **mesmo `.env`** deves ter:

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres (TLS: `?sslmode=require` na managed DO) |
| `ANALYTICS_API_KEY` | Chave da API em runtime |
| `VITE_ANALYTICS_API_KEY` | **A mesma chave** — necessária no **build** do frontend |

## PostgreSQL na DigitalOcean (Managed)

1. **Trusted sources:** permite o **Droplet** (ou o IP fixo da VM) na base; sem isto o contentor `api` não liga.
2. **`DATABASE_URL`:** `postgresql://doadmin:…@…ondigitalocean.com:25060/<nome_da_bd>?schema=public&sslmode=require` — o mesmo URI que usas no localhost serve no servidor, desde que o Droplet esteja autorizado.
3. **Migrações:** ao arrancar, `deploy/docker-api-entrypoint.sh` corre `npx prisma migrate deploy` antes da API; a base precisa de permissões do utilizador (`doadmin` costuma bastar).
4. **Segredos:** o `.env` no servidor **não** vai para o GitHub; o workflow de deploy faz `git pull` + Compose com **`docker-compose.local.yml`** no Droplet — cria/edita `.env` uma vez no servidor (ver secção seguinte).

## EasyPanel (Traefik / proxy do painel)

1. Repositório com **`.env`** na raiz (`DATABASE_URL`, `ANALYTICS_API_KEY`, `VITE_ANALYTICS_API_KEY` para o build do `web`).
2. No painel, comando típico: **`docker compose up -d --build`** na pasta do clone, usando **`docker-compose.yml`** ou **`docker-compose.easypanel.yml`** (equivalente, se suportar `include`).
3. O proxy deve encaminhar tráfego HTTP(S) para o serviço **`web`**, **porta do contentor 80** (não confundir com a API **3333**, que só precisa de rede interna entre contentores).
4. **Não** é necessário mapear `80:80` ou `3000:3000` no Compose: o painel liga-se à rede interna do stack.

## No Droplet ou PC com porta no host (resumo)

Quando queres abrir o painel em **`http://IP:8080/`** sem Traefik a mapear o contentor:

```bash
cd /var/www/tiktok-analytics   # ou o caminho do teu clone
git pull
cp .env.example .env
nano .env   # DATABASE_URL, ANALYTICS_API_KEY, VITE_ANALYTICS_API_KEY=igual à chave

docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Abre **`http://IP-DO-DROPLET:8080/`** (porta **8080** por defeito). Teste de saúde no servidor:

```bash
curl -s http://127.0.0.1:8080/health
```

Para usar a **porta 80** no host (só se estiver livre), no `.env`: `COMPOSE_WEB_PORT=80` e volta a fazer o comando com **`docker-compose.local.yml`**.

## Atualizar código

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

(Em **EasyPanel** sem publicar porta no host: só **`docker compose up -d --build`** com o ficheiro base.)

### Se `git pull` diz que alterações locais seriam sobrescritas (`docker-compose.yml`, `package-lock.json`, …)

O clone na VM ficou atrás da `origin` e comandos novos (`npm run db:check`, scripts em `scripts/`) **não aparecem** até o `pull` concluir com sucesso.

1. **`cd`** ao directório certo (**sempre** o clone, ex. `/var/www/tiktok-analytics`; **não** correr `npm`/Prisma em `/root` — erro `ENOENT` / `Missing script`).
2. Ver estado: **`git status`**
3. Opções (escolher uma):

   - **Guardar e alinhar com o repo (recomendado se não precisares dos diffs na VM):**  
     **`git stash push -m vm-local -- docker-compose.yml docker-compose.local.yml package-lock.json`** (ou **`git stash -u`** se houver mais ficheiros) → **`git pull`** → opcional **`git stash pop`** (resolver conflitos se aparecerem).
   - **Só queres o que está na `origin` e os ficheiros listados foram alterados por engano:**  
     **`git restore docker-compose.yml docker-compose.local.yml package-lock.json`** (Git ≥ 2.23; equivalente mais antigo: **`git checkout -- …`**) → **`git pull`**.

4. Depois: **`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`** (Droplet/PC com porta no host) **ou** **`docker compose up -d --build`** (EasyPanel) **ou**, se trabalhás na raiz com Node sem Compose para diagnóstico: **`npm install`** → **`npx prisma migrate deploy`** → **`npm run db:check`**.

### Host vs contentor (`prisma`/npm)

No **servidor só com SSH**, usar **`docker compose exec api …`** quando a API está em Compose (entrada faz `migrate deploy`; ver `deploy/docker-api-entrypoint.sh`). O binário **`prisma`** pode não estar no `PATH` do host — usar **`npx prisma …`** dentro do clone **ou** no contentor onde as `node_modules` existem.

### Prisma Studio a partir da VM no teu browser

Studio escuta **`127.0.0.1:5555`** no servidor no `--network host` típico. No **PC**, abrir túnel (noutro terminal local):

```bash
ssh -L 5555:127.0.0.1:5555 root@<IP-DO-DROPLET>
```

No servidor: **`npm run prisma:studio`** (ou equivalente no contentor) e **não** interromper com Ctrl+C enquanto quiseres a UI. No browser local: **http://127.0.0.1:5555**.

## Deploy automático (GitHub Actions)

O workflow `.github/workflows/deploy-droplet-docker.yml` corre em cada **`push`** em **`main`** ou quando carregas **Run workflow** em **Actions**. Faz SSH ao Droplet, alinha o `git` com `origin/main` e corre **`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`** (porta **8080** no host para teste `curl`).

Configuração **única**: secrets no repo (ver cabeçalho do YAML) — `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, e opcionalmente `DROPLET_DEPLOY_PATH`. No servidor já tem de existir **`.env`** completo e Docker funcional.

## Imagens remotas (“só subir a imagem”)

Podes fazer **build** no CI ou na tua máquina, **push** para GitHub Container Registry ou Docker Hub, e no servidor só `pull` das imagens e `compose up`. Para isso, troca os blocos `build:` no `docker-compose.yml` por `image: ghcr.io/ORG/PROJECT-api:TAG` / `image: ...-web:TAG` (e documenta tags no teu fluxo CI).

## PM2 vs Docker

Se usares Compose, **não** é necessário PM2 nem Nginx instalados à mão na VM — apenas Docker.

## HTTPS

Para TLS em produção, podes colocar **Caddy** ou **Traefik** à frente, ou um Nginx no host com Certbot. Com **`docker-compose.local.yml`**, faz proxy para a porta publicada do contentor `web` (defeito **8080** no host). Com **EasyPanel** só no stack base, o painel costuma terminar TLS e ligar-se ao **`web:80`** na rede Docker.
