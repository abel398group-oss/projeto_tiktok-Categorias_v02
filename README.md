# projeto_tiktok-Categorias_v02

Scraper de categorias do TikTok Shop (Node.js, Puppeteer) com saída em `output/dados_produtos.json` e `output/dados_lojas.json`.

- Fluxo e comandos: [`FLUXO.md`](FLUXO.md)
- Tarefas e visão: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Arquitetura e contrato JSON: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## CI / Testes automáticos

O GitHub Actions corre **`npm test`** (regressão em `test/scrape-regression.test.mjs`) em **cada push** e em **cada pull request** para a branch. O workflow vive em [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

- Se os testes **falharem** no PR, a equipa **não deve fazer merge** até corrigir ou justificar a alteração: os testes protegem o contrato de **preço**, **vendas**, **merge** por `product_id` e regras de **loja** / normalização cobertos pela suíte.
- Isto **não** substitui uma revisão humana, mas evita regredir a lógica já validada em v1.

## Desenvolvimento

```bash
npm install
npm test
```

Correr a coleta: ver [`FLUXO.md`](FLUXO.md).
