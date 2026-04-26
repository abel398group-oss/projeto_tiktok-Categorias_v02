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
