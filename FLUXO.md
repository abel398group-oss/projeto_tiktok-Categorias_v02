# Fluxo do projeto

Passos na ordem — da instalação até ao ficheiro com os produtos.

### Um comando (recomendado)

O script **já corre tudo em sequência** no mesmo `node` (primeiro a categoria, depois o opcional de fotos no PDP). **Não** é preciso lançar dois comandos em fila.

| O quê | Comando |
|--------|--------|
| **Duas** categorias (rápido; só grelha) + `output/dados_*.json` consolidados | `npm run coleta` |
| Idem, e **no fim** importa para o Postgres (precisa de `DATABASE_URL` no `.env`) | `npm run coleta:db` |
| **Duas** categorias + galeria no PDP (`fotos_pdp`, mais lento) + consolidado | `npm run coleta:completa` |
| Idem + **import** para o banco | `npm run coleta:completa:db` |
| Mesmo que a linha anterior, e no fim **`analytics:product-score`** | `npm start` |
| Igual à completa, com browser visível p/ login | `npm run coleta:completa:login` |
| Idem com login + **import** para o banco | `npm run coleta:completa:login:db` |
| Uma categoria só, com PDP (`OUTPUT_DIR` / `CATEGORY_URL` se precisar) | `npm run coleta:uma:completa` |
| Uma categoria, só grelha (sem `PDP_GALLERY`) + **import** | `npm run coleta:uma:db` |
| Uma categoria com PDP + **import** | `npm run coleta:uma:completa:db` |

O script `scrape-both` propaga as variáveis de ambiente (incl. `PDP_GALLERY`) a cada corrida. Atalhos equivalentes: `scrape:category` / `scrape:category:pdp` (uma categoria).

---

### 1. Preparar o ambiente (só da primeira vez)

Abre o terminal **na pasta do projeto** e instala dependências:

```bash
npm install
```

Precisas de **Node.js** instalado no PC.

---

### 2. Correr a coleta

**Rápida (só grelha):**
```bash
npm run coleta
```

**Completa (as **duas** categorias, grelha + fotos do PDP, demora mais; depois consolida em `output/dados_*.json`):**
```bash
npm run coleta:completa
```

Uma categoria só com PDP: `npm run coleta:uma:completa` (ou `npm run scrape:category:pdp`).

Os comandos `*:db` acrescentam **só o passo** `import-output-to-db` (Prisma) depois de existirem `output/dados_*.json`. Continuam a ser criados os mesmos ficheiros JSON; o banco fica alinhado à última consolidação. Se não quiseres importar, usa `coleta` / `coleta:completa` / … sem sufixo `:db`.

Espera a execução acabar sozinha.

---

### 3. Abrir o ficheiro com os dados dos produtos

O resultado que interessa para análise está **na raiz de `output/`**:

**`output/dados_produtos.json`** · **`output/dados_lojas.json`**

(Ficheiros de apoio — debug, cópia técnica, etc. — ficam em **`output/extra/`**.)

**Produto e loja no output (contrato):**

- `dados_produtos.json` — lista de **produtos**; cada item inclui `seller_id` e campos de loja **desnormalizados** (`nome_loja`, `loja_*`, …) para leitura rápida.
- `output/dados_lojas.json` (na **raiz** de `output/`, ao lado de `dados_produtos.json`) — **uma linha por `seller_id`**, com dados de loja **consolidados** (fonte agregada; liga-se ao produto pela mesma chave `seller_id`).

Detalhe e modelo (produto / loja / snapshots no Postgres): **`docs/ARCHITECTURE.md`** — ver secções **Contrato dos outputs**, **Decisão arquitetural: modelo híbrido** e **Modelo Postgres (Prisma) — implementado**.

Para **consultar dados já importados** no Postgres sem SQL direto: com `DATABASE_URL` no `.env`, corre **`npm run prisma:studio`** (interface web tipo `localhost:5555`; ver **`README.md`**).

---

### 4. (Se precisares) Mudar a categoria

Por defeito o script usa uma URL de exemplo dentro do código. Para outra categoria, define a variável **antes** do comando:

**Windows (cmd):**
```bat
set CATEGORY_URL=https://shop.tiktok.com/br/c/... 
npm run coleta
```

**Git Bash / Mac / Linux:**
```bash
export CATEGORY_URL="https://shop.tiktok.com/br/c/..."
npm run coleta
```

---

### 5. (Se o TikTok bloquear ou pedir login)

Usa o browser **visível**, faz login na janela e espera o script continuar:

```bash
npm run scrape:category:headed
```

Ou, se quiseres já a coleta completa com login visível: **`npm run coleta:completa:login`**.

O login pode ficar guardado no perfil `.chrome-tiktok-profile` nas próximas vezes.

---

### 6. Fotos do PDP (já incluído em `coleta:completa`)

Não precisas de um segundo comando: **`npm run coleta:completa`** abre a categoria e, a seguir, os PDPs (até 25 por defeito) numa **única** execução. As URLs extra ficam em **`fotos_pdp`** no `dados_produtos.json` (quando a recolha conseguir obtê-las).

---

### 7. Antes de alterar o parser / lógica de extração

Confirma que nada quebrou:

```bash
npm test
```

---

### 8. Branches no Git

O repositório usa **`main`** (linha principal) e **`backup`** (cópia de segurança). Trabalha na que estiveres a usar; com **`git branch`** vês em qual estás.

---

### 9. Servidor Analytics (API HTTP, `localhost`)

Com **`DATABASE_URL`** e **`ANALYTICS_API_KEY`** no **`.env` na raiz** do projeto (ver **`.env.example`**):

```bash
npm run analytics:api
```

- Por defeito escuta em **`http://127.0.0.1:3333`** (opcional `ANALYTICS_API_PORT` / `ANALYTICS_API_HOST` no `.env`).
- Endpoints só leitura: `GET /health`, `GET /analytics/top-products`, `…/opportunities`, `…/product-score`, `…/growth`, `…/new-products` — sempre com **`Authorization: Bearer <ANALYTICS_API_KEY>`** (detalhes em **`docs/ANALYTICS-API.md`**).

Para **consultar relatórios no terminal** (sem subir servidor): `npm run analytics:top-products`, `…`, `npm run analytics:product-score`; interpretação extra: **`npm run analytics:decision`** (usa o mesmo score já calculado; ver `scripts/analytics/product-decision-cli.mjs`) · **produtos para escalar**: **`npm run analytics:scalable`** (lista “validados” e “apostas” sobre o mesmo top do score — ver `scripts/analytics/scalable-products.mjs`).

---

### 10. Frontend no browser (`localhost`, Vite)

Interface mínima em **`frontend/`** (React): mostra dados da API através de **proxy do Vite** (evita CORS no desenvolvimento).

**Primeiro terminal (na raiz do repo)** — mantém a API no ar:

```bash
npm run analytics:api
```

**Segundo terminal:**

```bash
cd frontend
npm install
npm run dev
```

- O Vite usa por defeito **`http://localhost:5173/`** (tenta abrir o browser ao arrancar). Se **5173** estiver ocupada, pode arrancar **outra porta** — confirma o URL no terminal antes de abrir o link à mão. Usar **Carregar dados** nas abas.
- No **`frontend/.env`** define **`VITE_ANALYTICS_API_KEY`** com o **mesmo** valor que **`ANALYTICS_API_KEY`** na raiz (ver **`frontend/README.md`** e **`frontend/.env.example`**).
- Sem a API na porta combinada (**3333** por defeito ou a que configuraste), o navegador mostra erro e o terminal do Vite pode indicar **`ECONNREFUSED`** ao tentar proxificar `/analytics`.

**Um terminal (API + Vite)** — desenvolvimento rápido, logs no mesmo terminal com prefixos **`API`** / **`FRONT`** (`concurrently`):

```bash
npm run dev:all
```

Alteraste **portas** (`ANALYTICS_API_PORT` ou `vite.config.js`)? Atualiza **este ficheiro** para quem ler no futuro encontrar URLs certas.

---

Instala com **`npm install`**, corre **`npm run coleta`** (rápida) ou **`npm run coleta:completa`** (categoria + `fotos_pdp`), lê **`output/dados_produtos.json`**.  
Se der erro de sessão, **`npm run coleta:completa:login`** (ou o passo 5).  
Para **painel analytics no browser**, **`npm run dev:all`** (secção **10**, um terminal) ou dois terminais: **`npm run analytics:api`** + **`cd frontend && npm run dev`** (secções **9** e **10**).
