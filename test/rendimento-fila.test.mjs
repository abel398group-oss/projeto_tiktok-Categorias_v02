/**
 * A fila de coleta é ordenada pelo que cada categoria rende de facto.
 *
 * Antes a ordem era a do catálogo — uma lista escrita à mão que não sabe nada
 * sobre onde há produto. Numa coleta interrompida a meio (o caso normal, porque
 * são 212 categorias), isso gastava o tempo de navegador nas primeiras da lista
 * em vez de nas que produzem.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { contarProdutosColhidos } from "../scripts/scrape-all-categories.mjs";

/** Reproduz a ordenação da fila de scripts/scrape-all-categories.mjs. */
function ordenarFila(pending, rendimento) {
  const rend = (c) => (Number.isFinite(rendimento[c]?.produtos) ? rendimento[c].produtos : null);
  return [...pending].sort((a, b) => {
    const ra = rend(a);
    const rb = rend(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return -1;
    if (rb == null) return 1;
    return rb - ra;
  });
}

describe("ordem da fila por rendimento", () => {
  test("categoria nunca medida vem antes das já medidas", () => {
    const ordem = ordenarFila(["ja-medida", "nova"], { "ja-medida": { produtos: 500 } });
    assert.equal(ordem[0], "nova", "só se descobre o rendimento colhendo — o desconhecido vem primeiro");
  });

  test("entre as medidas, a mais produtiva vem primeiro", () => {
    const ordem = ordenarFila(["fraca", "forte"], {
      fraca: { produtos: 4 },
      forte: { produtos: 300 }
    });
    assert.deepEqual(ordem, ["forte", "fraca"]);
  });

  test("desconhecidas primeiro, depois produtivas, depois fracas", () => {
    const ordem = ordenarFila(["fraca", "nova", "forte"], {
      fraca: { produtos: 4 },
      forte: { produtos: 300 }
    });
    assert.deepEqual(ordem, ["nova", "forte", "fraca"]);
  });
});

describe("contarProdutosColhidos", () => {
  test("conta os itens do ficheiro da categoria", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rend-"));
    await writeFile(
      path.join(dir, "dados_produtos.json"),
      JSON.stringify({ itens: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
      "utf8"
    );
    assert.equal(await contarProdutosColhidos(dir), 3);
  });

  test("categoria vazia rende zero — que é diferente de não medida", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rend-"));
    await writeFile(path.join(dir, "dados_produtos.json"), JSON.stringify({ itens: [] }), "utf8");
    assert.equal(await contarProdutosColhidos(dir), 0);
  });

  test("sem ficheiro devolve null, não zero", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rend-"));
    await mkdir(path.join(dir, "vazio"), { recursive: true });
    assert.equal(
      await contarProdutosColhidos(path.join(dir, "vazio")),
      null,
      "não medido tem de se distinguir de medido-e-deu-zero"
    );
  });

  test("ficheiro corrompido devolve null em vez de rebentar a coleta", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rend-"));
    await writeFile(path.join(dir, "dados_produtos.json"), "{ isto não é json", "utf8");
    assert.equal(await contarProdutosColhidos(dir), null);
  });
});
