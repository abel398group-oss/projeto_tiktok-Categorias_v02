# Deploy com Docker (modo simples)

Um contentor corre a **API** (Node + Prisma); outro o **Nginx** com o build do **React** e proxy de `/analytics` e `/health` para a API.

## Requisitos

- **Docker** + **Docker Compose** v2 (plugin `docker compose`) no servidor.
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
4. **Segredos:** o `.env` no servidor **não** vai para o GitHub; o workflow de deploy só faz `git pull` + `docker compose up` — cria/edita `.env` uma vez no Droplet (ver secção seguinte).

## No Droplet (resumo)

```bash
cd /var/www/tiktok-analytics   # ou o caminho do teu clone
git pull
cp .env.example .env
nano .env   # DATABASE_URL, ANALYTICS_API_KEY, VITE_ANALYTICS_API_KEY=igual à chave

docker compose up -d --build
```

Abre **`http://IP-DO-DROPLET:8080/`** (porta **8080** por defeito — a **80** no host costuma estar ocupada por Nginx/EasyPanel). Teste de saúde no servidor:

```bash
curl -s http://127.0.0.1:8080/health
```

Para usar a **porta 80** no host (só se estiver livre), no `.env`: `COMPOSE_WEB_PORT=80` e volta a fazer `docker compose up -d --build`.

## Atualizar código

```bash
git pull
docker compose up -d --build
```

## Deploy automático (GitHub Actions)

O workflow `.github/workflows/deploy-droplet-docker.yml` corre em cada **`push`** em **`main`** ou quando carregas **Run workflow** em **Actions**. Faz SSH ao Droplet, alinha o `git` com `origin/main` e corre **`docker compose up -d --build`**.

Configuração **única**: secrets no repo (ver cabeçalho do YAML) — `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, e opcionalmente `DROPLET_DEPLOY_PATH`. No servidor já tem de existir **`.env`** completo e Docker funcional.

## Imagens remotas (“só subir a imagem”)

Podes fazer **build** no CI ou na tua máquina, **push** para GitHub Container Registry ou Docker Hub, e no servidor só `pull` das imagens e `compose up`. Para isso, troca os blocos `build:` no `docker-compose.yml` por `image: ghcr.io/ORG/PROJECT-api:TAG` / `image: ...-web:TAG` (e documenta tags no teu fluxo CI).

## PM2 vs Docker

Se usares Compose, **não** é necessário PM2 nem Nginx instalados à mão na VM — apenas Docker.

## HTTPS

Para TLS em produção, podes colocar **Caddy** ou **Traefik** à frente, ou um Nginx no host com Certbot, e fazer proxy para a porta publicada do contentor `web` (defeito **8080** no host). O detalhe depende do teu domínio.
