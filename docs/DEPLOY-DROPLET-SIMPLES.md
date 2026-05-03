# Deploy simples — Droplet DigitalOcean + Nginx + systemd

Modo **simples** (um único Droplet): **Nginx** serve o **build estático** do React na raiz do domínio e faz **proxy reverso** de `/analytics` e `/health` para a **API Node** (Fastify) em `127.0.0.1:3333`. A base de dados recomendada é **PostgreSQL gerido** na DigitalOcean (ou outro Postgres acessível por TLS).

**Segurança (ler):** o front embute `VITE_ANALYTICS_API_KEY` no JavaScript — **quem abre o DevTools vê a chave**. Em “modo simples” serve para equipa fechada ou demo. Para produção exigente, use outro modelo de auth mais tarde (“modo hard”).

---

## 0. O que vais precisar

- Conta **DigitalOcean**
- **Domínio** (ou subdomínio) com DNS a apontar para o IP do Droplet
- Repositório Git (GitHub ou clone por SSH no servidor)
- Postgres com `DATABASE_URL` (ideal: **Managed Database** na mesma região do Droplet)

---

## 1. Criar o Droplet

1. **Create → Droplets** · **Ubuntu 22.04 LTS**
2. Plano com **RAM confortável** (mínimo habitual 2 GB se também fores correr coleta no mesmo droplet; só API+front, 1 GB pode bastar para poucos utilizadores)
3. Escolhe região próxima dos utilizadores / do Postgres gerido
4. **SSH keys** · cria o Droplet
5. Anota o **IP público**

### Firewall (na DO e/ou no servidor)

No Droplet, após login:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 2. Postgres (recomendado: Managed)

1. DigitalOcean → **Databases → PostgreSQL**
2. Mesma região que o Droplet
3. Liga o Droplet à base (Trusted sources) ou usa **connection string** com SSL
4. **`DATABASE_URL`** no formato Prisma, com SSL, por exemplo:

```text
postgresql://doadmin:SENHA@db-postgresql-XXX.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

(Copia a string do painel e ajusta se o nome da DB for outro.)

Corre **migrate** no servidor (passo 7) para criar tabelas.

---

## 3. DNS

No teu fornecedor DNS, cria um registo **A**:

- **Nome:** `tiktok` ou `@` (ou o subdomínio que quiseres)
- **Valor:** IP do Droplet

Espera propagar (alguns minutos a horas).

---

## 4. Preparar o servidor (Ubuntu)

Entra por SSH como `root` ou utilizador com `sudo`:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git certbot python3-certbot-nginx
```

### Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

---

## 5. Clonar o projeto

Exemplo de pasta (ajusta o URL do teu repo):

```bash
sudo mkdir -p /opt
sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/SEU_USER/projeto_tiktok-Categorias_v02.git
cd projeto_tiktok-Categorias_v02
```

Para actualizares no futuro: `git pull` na mesma pasta.

---

## 6. Variáveis de ambiente (raiz do repo)

```bash
cp .env.example .env
nano .env
```

Define **no mínimo**:

- `DATABASE_URL` — string do Postgres (com `sslmode=require` se gerido)
- `ANALYTICS_API_KEY` — chave longa e secreta **só tua**
- `ANALYTICS_API_HOST=127.0.0.1` — a API **só** aceita ligações locais; o Nginx faz o proxy
- `ANALYTICS_API_PORT=3333` — ou outra porta livre (ajusta Nginx + systemd se mudares)

Se usares **export Spaces** no painel, descomenta e preenche `SPACES_*` como no `.env.example`.

**Não** faças commit do `.env`.

---

## 7. Instalar dependências e base de dados

Na **raiz** do repositório:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Importa dados quando tiveres JSON (podes importar noutra máquina e usar a mesma BD, ou copiar `output/` para o servidor e correr `npm run db:import:output` uma vez).

---

## 8. Build do frontend (com a chave da API)

O build precisa da **mesma chave** que `ANALYTICS_API_KEY`:

```bash
cd frontend
cp .env.example .env.production.local
nano .env.production.local
```

Ficheiro **`frontend/.env.production.local`** (nome reconhecido pelo Vite em `npm run build`; podes usar `.env.production` em alternativa):

```env
VITE_ANALYTICS_API_KEY=cole-a-mesma-chave-que-no-.env-da-raiz
# Deixa VITE_API_URL vazio: o browser fala ao mesmo domínio; o Nginx encaminha /analytics → API
```

```bash
npm ci
npm run build
cd ..
```

Saída em `frontend/dist/`.

---

## 9. Nginx — site + proxy para a API

Copia o exemplo do repositório e ajusta **`server_name`** e caminhos:

```bash
sudo cp deploy/nginx-tiktok-analytics.example.conf /etc/nginx/sites-available/tiktok-analytics
sudo nano /etc/nginx/sites-available/tiktok-analytics
```

Altera:

- `server_name` → o teu domínio (`tiktok.exemplo.com`)
- `root` → caminho absoluto para `frontend/dist` no servidor (ex.: `/opt/projeto_tiktok-Categorias_v02/frontend/dist`)

Activa o site e remove o default se conflitar:

```bash
sudo ln -sf /etc/nginx/sites-available/tiktok-analytics /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Ainda não tens HTTPS** até ao passo 11; podes testar `http://DOMINIO/` (deve carregar o React) — os pedidos a `/analytics/*` falharão até a API estar a correr (passo seguinte).

---

## 10. API com systemd (arranque automático)

```bash
sudo cp deploy/tiktok-analytics-api.service.example /etc/systemd/system/tiktok-analytics-api.service
sudo nano /etc/systemd/system/tiktok-analytics-api.service
```

Ajusta **`WorkingDirectory`**, **`EnvironmentFile`**, **`User`/`Group`** (deve ser o utilizador Linux dono dos ficheiros do clone — exemplo `ubuntu` no Droplet) e o caminho de **`ExecStart`**.

```bash
sudo systemctl daemon-reload
sudo systemctl enable tiktok-analytics-api
sudo systemctl start tiktok-analytics-api
sudo systemctl status tiktok-analytics-api
```

Teste local no servidor:

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" http://127.0.0.1:3333/health
curl -s -H "Authorization: Bearer SUA_CHAVE" http://127.0.0.1:3333/analytics/categories
```

Depois, pelo **domínio** (sem expor a chave no URL; usa header no `curl`):

```bash
curl -s -H "Authorization: Bearer SUA_CHAVE" https://DOMINIO/analytics/categories
```

---

## 11. HTTPS com Let’s Encrypt

```bash
sudo certbot --nginx -d teu.dominio.com
```

O Certbot altera o bloco `server` para escutar 443 e renovações automáticas.

---

## 12. Verificação rápida

| Teste | Resultado esperado |
|--------|---------------------|
| Abrir `https://dominio/` | Painel inicial (categorias) ou loading |
| Separador Analytics com dados na BD | Tabelas após pedidos à API |
| `GET /health` via Nginx | `{"ok":true,...}` sem Bearer (health é público na API actual) |

**Nota:** em produção atrás do Nginx o browser chama só `https://dominio/analytics/...` — igual ao modo dev com proxy.

---

## 13. Actualizar só o código ou o front depois

```bash
cd /opt/projeto_tiktok-Categorias_v02
git pull
npm ci
npx prisma migrate deploy
cd frontend && npm ci && npm run build && cd ..
sudo systemctl restart tiktok-analytics-api
sudo nginx -t && sudo systemctl reload nginx
```

---

## Ficheiros de exemplo no repo

| Ficheiro | Uso |
|----------|-----|
| `deploy/nginx-tiktok-analytics.example.conf` | Virtual host Nginx |
| `deploy/tiktok-analytics-api.service.example` | Unidade systemd |
| `frontend/.env.production.example` | Variáveis do build |

---

## Problemas comuns

- **502 em `/analytics/...`** — API parada ou porta errada; `journalctl -u tiktok-analytics-api -n 50`
- **`ECONNREFUSED` no browser** — normal se tentares porta 3333 no browser público; o front **não** deve usar `VITE_API_URL` externo neste modelo — usa apenas o mesmo domínio + Nginx
- **Prisma / SSL** — confirma `?sslmode=require` na Managed DB da DO
- **Página React 404 ao refrescar `/analytics`** — confirma `try_files … /index.html` no bloco estático do Nginx (está no exemplo)

Quando quiseres **Docker, App Platform ou CI/CD** como no hipervias, passamos ao “modo hard” por cima desta base.
