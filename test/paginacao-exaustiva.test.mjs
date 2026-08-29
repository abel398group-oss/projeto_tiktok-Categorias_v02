/**
 * Profundidade da coleta: "a lista acabou" é diferente de "nós parámos".
 *
 * O TikTok não publica quantos produtos cada subcategoria tem, por isso não
 * existe percentagem honesta de cobertura DENTRO da categoria. O único facto
 * mensurável é por que a paginação terminou: se o botão «ver mais» sumiu, a
 * categoria deu o que tinha; se gastámos o teto de cliques com o botão ainda
 * lá, a categoria tem mais e o corte foi nosso.
 *
 * Sem esta distinção, 110 produtos de uma categoria de 110 e 110 de uma
 * categoria de 900 entram na base com exactamente a mesma cara — e a mediana
 * de preço da segunda descreve o topo da lista, não a categoria.
 */
import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { lerPaginacao } from "../scripts/scrape-all-categories.mjs";

let dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "paginacao-"));
});
after(async () => {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

/** Escreve um dados_produtos.json com o bloco `paginacao` pedido. */
async function comPaginacao(paginacao) {
  const sub = await fs.mkdtemp(path.join(dir, "cat-"));
  await fs.writeFile(
    path.join(sub, "dados_produtos.json"),
    JSON.stringify({ total: 110, itens: [], ...(paginacao !== undefined ? { paginacao } : {}) }),
    "utf8"
  );
  return sub;
}

describe("lerPaginacao", () => {
  test("botão sumiu = lista esgotada", async () => {
    const d = await comPaginacao({ motivo: "sem_botao", cliques: 6, exaustiva: true });
    assert.deepEqual(await lerPaginacao(d), { exaustiva: true, motivo: "sem_botao", cliques: 6 });
  });

  test("teto de cliques = CORTADA, a categoria tem mais", async () => {
    const d = await comPaginacao({ motivo: "teto_de_cliques", cliques: 30, exaustiva: false });
    const r = await lerPaginacao(d);
    assert.equal(r.exaustiva, false, "gastar o teto não é esgotar a lista");
    assert.equal(r.motivo, "teto_de_cliques");
  });

  test("clique falhado não conta como esgotada — é problema nosso, não fim de lista", async () => {
    const d = await comPaginacao({ motivo: "clique_falhou", cliques: 3, exaustiva: false });
    assert.equal((await lerPaginacao(d)).exaustiva, false);
  });

  test("parou de crescer = esgotada na prática", async () => {
    const d = await comPaginacao({ motivo: "sem_crescimento", cliques: 9, exaustiva: true });
    assert.equal((await lerPaginacao(d)).exaustiva, true);
  });

  test("ficheiro antigo sem o bloco devolve null, não um falso 'esgotada'", async () => {
    const d = await comPaginacao(undefined);
    assert.equal(await lerPaginacao(d), null, "ausência não pode virar afirmação");
  });

  test("pasta inexistente devolve null em vez de rebentar a coleta", async () => {
    assert.equal(await lerPaginacao(path.join(dir, "nao-existe")), null);
  });

  test("bloco corrompido devolve null", async () => {
    const d = await comPaginacao("isto não é um objecto");
    assert.equal(await lerPaginacao(d), null);
  });
});
