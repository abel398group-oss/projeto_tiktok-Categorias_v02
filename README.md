# projeto_tiktok-Categorias_v02

Scraper de categorias do TikTok Shop (Node.js, Puppeteer) com saída em `output/dados_produtos.json` e `output/dados_lojas.json`.

- Fluxo e comandos: [`FLUXO.md`](FLUXO.md)
- Tarefas e visão: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Arquitetura e contrato JSON: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Requisitos

- Node.js >= 20
- npm

## CI / Testes automáticos

O GitHub Actions executa npm test em push e pull request.  
Merge só deve ocorrer com testes a verde.  
Protege módulos críticos: preço, vendas, merge e loja.

A validação de **schema** dos JSON de saída (`npm run validate:schemas`) é **local** — não corre no CI, para não falhar quando `output/` não existe no clone (ex.: GitHub Actions). No futuro pode integrar-se com ficheiros de fixture.

## Validação de schema dos outputs

Valida `output/dados_produtos.json` e `output/dados_lojas.json` contra `schemas/dados_produtos.schema.json` e `schemas/dados_lojas.schema.json` (AJV). Protege o **contrato** de tipos e chaves definidos; campos extra no JSON **não** são rejeitados.

```bash
npm run validate:schemas
```

Correr **depois** de uma coleta que tenha gerado os dois ficheiros na raiz de `output/`, por exemplo após `npm run coleta` ou `npm run coleta:completa`.

## Desenvolvimento

```bash
npm install
npm test
```

Correr a coleta: ver [`FLUXO.md`](FLUXO.md).

## Aviso

Este projeto realiza coleta de dados públicos.  
Respeite os termos de uso das plataformas.  
Uso por conta e risco.

## Tag de release (v0.1.0)

Depois de rever e commitar as alterações pretendidas:

```bash
git tag v0.1.0
git push origin v0.1.0
```
