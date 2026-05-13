# DigitalOcean Spaces — upload de imagens de produtos (pós-coleta)

## Objetivo

Enviar imagens dos produtos coletados para um bucket DigitalOcean Spaces (compatível com S3), sem alterar o scraper.

Este fluxo é **pós-coleta**: lê `output/dados_produtos.json`, baixa URLs externas (`fotos` / `fotos_pdp`), faz upload e gera um mapeamento em `output/dados_produtos_com_storage.json`.

## Pré-requisitos

- Node.js >= 20 (o script usa `fetch` nativo).
- `npm install` na raiz.
- `output/dados_produtos.json` já gerado pelo scraper.
- Bucket no DigitalOcean Spaces já existente (pode ser o mesmo do HiperTMS).

## Variáveis de ambiente (raiz `.env`)

Definir no `.env` (não committar):

- `SPACES_ENDPOINT` (ex.: `https://nyc3.digitaloceanspaces.com`)
- `SPACES_REGION` (ex.: `nyc3`)
- `SPACES_BUCKET` (nome do bucket)
- `SPACES_ACCESS_KEY_ID`
- `SPACES_SECRET_ACCESS_KEY`
- `SPACES_PUBLIC_BASE_URL` (URL pública do bucket/CDN, sem barra final)
- `SPACES_PREFIX` (prefixo/pasta separado para este projeto)
  - recomendado: `analytics/tiktok/products`

Exemplo (valores reais sem segredos):

```bash
SPACES_ENDPOINT=https://sfo3.digitaloceanspaces.com
SPACES_REGION=sfo3
SPACES_BUCKET=hipertms-bucket
SPACES_PUBLIC_BASE_URL=https://SEU-CDN-OU-BUCKET.sfo3.cdn.digitaloceanspaces.com
SPACES_PREFIX=analytics/tiktok/products
```

Opcional:

- `SPACES_OBJECTS_PUBLIC_READ=1` para enviar objetos com ACL `public-read` (apenas se o bucket não for público por política).
- `SPACES_FORCE_PATH_STYLE=1` se o seu endpoint exigir path-style.

## Organização no bucket (anti-mistura com HiperTMS)

O script grava em:

`<SPACES_PREFIX>/<productId>/<sha256>.<ext>`

Exemplo:

`analytics/tiktok/products/1731468306519983497/2c9f...a9.webp`

Assim o conteúdo deste projeto fica separado por prefixo e por produto, sem tocar em chaves/pastas do HiperTMS.

## Comando

Na raiz do repositório:

```bash
npm run images:upload
```

Parâmetros opcionais (CLI):

- `--input output/dados_produtos.json` (default)
- `--out output/dados_produtos_com_storage.json` (default)
- `--product-id <id>` para processar só um produto
- `--max-products <n>` para limitar quantos produtos com imagem serão processados
- `--max-bytes <n>` para limitar tamanho máximo por imagem (default 8 MiB)
- `--timeout-ms <n>` para timeout do download (default 25000)
- `--retries <n>` (default 2)
- `--dry-run` para baixar/validar sem fazer upload

Também pode configurar via env:

- `IMAGES_UPLOAD_MAX_BYTES`
- `IMAGES_UPLOAD_TIMEOUT_MS`
- `IMAGES_UPLOAD_RETRIES`
- `IMAGES_UPLOAD_MAX_PRODUCTS`

## Saída gerada

O script escreve:

- `output/dados_produtos_com_storage.json`

Formato (por item):

- `productId`
- `originalImageUrl`
- `storageUrl` (depende de `SPACES_PUBLIC_BASE_URL`)
- `objectKey`

Em caso de erro por imagem, o item terá `error`. Em caso de dedupe/skip, terá `skipped`.

## Segurança e robustez

O script implementa:

- validação de `Content-Type` (apenas `image/*`);
- limite de tamanho por imagem;
- timeout de download;
- retry simples;
- não aborta o processo por falha numa imagem (continua e registra `error`);
- não imprime segredos em logs.

O script **não apaga** objetos no bucket.

## Como validar no Spaces

- Filtrar pelo prefixo configurado: `SPACES_PREFIX=analytics/tiktok/products`.
- Verificar se foram criadas pastas por `productId`.
- Conferir a URL pública:
  - se `SPACES_PUBLIC_BASE_URL` aponta para o bucket/CDN correto, `storageUrl` deve abrir a imagem no browser.

## Próximo passo (quando for a hora de gravar no banco)

O Prisma já tem `ProductSnapshot.images` e `ProductSnapshot.pdpImages` (JSON). Hoje esses campos guardam URLs do TikTok.

Para gravar URLs do Spaces no banco com segurança, a abordagem recomendada é:

- criar um passo separado pós-upload que:
  - localiza o snapshot do run mais recente do produto
  - escreve um novo JSON com URLs do storage (ou campos novos)

Isso será decidido antes de alterar schema/migrations.
