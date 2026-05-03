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

## No Droplet (resumo)

```bash
cd /var/www/tiktok-analytics   # ou o caminho do teu clone
git pull
cp .env.example .env
nano .env   # DATABASE_URL, ANALYTICS_API_KEY, VITE_ANALYTICS_API_KEY=igual à chave

docker compose up -d --build
```

Abre `http://IP-DO-DROPLET/` e testa `/health`:

```bash
curl -s http://127.0.0.1/health
```

## Atualizar código

```bash
git pull
docker compose up -d --build
```

## Imagens remotas (“só subir a imagem”)

Podes fazer **build** no CI ou na tua máquina, **push** para GitHub Container Registry ou Docker Hub, e no servidor só `pull` das imagens e `compose up`. Para isso, troca os blocos `build:` no `docker-compose.yml` por `image: ghcr.io/ORG/PROJECT-api:TAG` / `image: ...-web:TAG` (e documenta tags no teu fluxo CI).

## PM2 vs Docker

Se usares Compose, **não** é necessário PM2 nem Nginx instalados à mão na VM — apenas Docker.

## HTTPS

Para TLS em produção, podes colocar **Caddy** ou **Traefik** à frente, ou um Nginx no host com Certbot, e fazer proxy para a porta 80 do contentor `web`. O detalhe depende do teu domínio.
