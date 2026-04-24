# Fluxo do projeto

Passos na ordem — da instalação até ao ficheiro com os produtos.

### Um comando (recomendado)

O script **já corre tudo em sequência** no mesmo `node` (primeiro a categoria, depois o opcional de fotos no PDP). **Não** é preciso lançar dois comandos em fila.

| O quê | Comando |
|--------|--------|
| Só categoria (mais rápido; `fotos` no JSON) | `npm run coleta` |
| Categoria + links extra das fotos no PDP (`fotos_pdp`) | `npm run coleta:completa` |
| Igual à completa, com browser visível p/ login | `npm run coleta:completa:login` |

(Equivalem a `scrape:category`, `scrape:category:pdp` e variante com `HEADED=1`.)

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

**Completa (grelha + fotos do PDP, demora mais):**
```bash
npm run coleta:completa
```

Espera a execução acabar sozinha.

---

### 3. Abrir o ficheiro com os dados dos produtos

O resultado que interessa para análise está **aqui**:

**`output/dados_produtos.json`**

(Ficheiros de apoio — debug, cópia técnica, lojas, etc. — ficam em **`output/extra/`**.)

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

### Resumo em três frases

Instala com **`npm install`**, corre **`npm run coleta`** (rápida) ou **`npm run coleta:completa`** (categoria + `fotos_pdp`), lê **`output/dados_produtos.json`**.  
Se der erro de sessão, **`npm run coleta:completa:login`** (ou o passo 5).
