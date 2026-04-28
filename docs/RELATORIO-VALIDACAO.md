# Relatório de validação (referência Cursor / equipa)

Documento resumo do que foi **validado** no pipeline **coleta → JSON → Postgres**, para não assumir mais do que o que foi testado.

**Estado:** validação de amostra + verificação automática do import; **não** é auditoria completa site ↔ base.

---

## 1. Validação automática JSON ↔ base (import)

- **Comando:** `npm run validate:db-vs-json` (requer `DATABASE_URL` no `.env`).
- **O que faz:** calcula o mesmo **SHA-256** que o importador (`input_hash`), localiza o **`ScrapeRun`** correspondente e compara, para cada `product_id` no `output/dados_produtos.json`, os campos do snapshot com o JSON (preço, original, desconto, estimados, vendas, texto de vendas, ratings, `seller_id`).
- **Resultado registado:** execução com sucesso (**exit 0**) com o consolidado actual: contagens alinhadas (ex.: itens com `product_id` = snapshots no run) e mensagem **OK** para o conjunto confrontado.

**Limitação:** valida consistência **ficheiro importado ↔ linhas escritas na BD**, não a “verdade” do TikTok.

---

## 2. Validação manual amostral (site ↔ JSON)

- **Escopo:** pelo menos **dois** produtos abertos no site TikTok Shop e confronto com os mesmos campos no `dados_produtos.json`.
- **Resultado:** em ambos os casos verificados pelo utilizador, o JSON foi considerado **coerente** com o site (amostra; não estatística).

**Limitação:** preço/vendas podem divergir ligeiramente da UI em tempo real; o contrato de negócio documenta **melhor esforço** (ver `docs/ARCHITECTURE.md`).

---

## 3. Fotos (`fotos` / `fotos_pdp`)

- **Onde na BD:** `ProductSnapshot.images` (`fotos` no JSON), `ProductSnapshot.pdpImages` (`fotos_pdp`).
- **Verificação:** para pelo menos um item, o array de URLs no JSON e o JSON armazenado em `pdpImages` na base foram **comparados** e considerados **iguais** (mesmas URLs e ordem).

---

## 4. Comportamento percebido pelo utilizador (reimportação)

- Confirmado conceptualmente e por desenho do código:
  - **Nova** coleta com **JSON alterado** + **import** → `Product` em **upsert** (actualização do “estado actual”) + **novas** linhas em `ProductSnapshot` (histórico).
  - **Mesmo** ficheiro consolidado importado duas vezes → import **ignorado** por `input_hash` (sem duplicar runs/snapshots).

---

## 5. O que **não** está coberto por este relatório

- Auditoria linha a linha de todos os produtos contra o site.
- Validação contínua em CI dos JSON (roadmap: fixtures).
- Comparativos entre **vários** runs (crescimento, tendências) — fase analítica futura.

---

## 6. Comandos úteis

| Objetivo | Comando |
|----------|---------|
| Schema JSON local | `npm run validate:schemas` |
| Import ↔ BD | `npm run validate:db-vs-json` |
| Regressão scraper | `npm test` |

---

*Para contexto técnico amplo do repositório e comparação com outros projectos:* `docs/CURSOR-CONTEXTO-SISTEMA.md`.
