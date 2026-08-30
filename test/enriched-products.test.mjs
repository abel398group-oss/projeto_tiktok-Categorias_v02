import test from "node:test";
import assert from "node:assert/strict";
import { listEnrichedProducts } from "../scripts/analytics/lib/enriched-products.mjs";

/**
 * O que se protege aqui: a ponte de vídeo perguntou "quem tem galeria?" e
 * recebeu zero, com material para sete vídeos na base. A causa era olhar só
 * para o snapshot mais recente — que uma re-coleta de categoria grava SEM
 * fotos, porque a listagem só traz a miniatura.
 */

function snap(capturedAt, { fotos = 0, salesCount = 0, price = 10 } = {}) {
  return {
    capturedAt: new Date(capturedAt),
    price,
    salesCount,
    ratingAverage: 4.5,
    ratingTotal: 100,
    pdpImages: Array.from({ length: fotos }, (_, i) => `https://cdn/x${i}.jpg`)
  };
}

/** Prisma do tamanho exacto do que o módulo usa. */
function prismaFalso(produtos) {
  return { product: { findMany: async () => produtos } };
}

const BASE = { productId: "p1", name: "Produto", productUrl: "u", categoryUrl: "c", currency: "BRL", seller: { name: "Loja" } };

test("usa a galeria de um run anterior quando a coleta recente a apagou", async () => {
  const r = await listEnrichedProducts(
    prismaFalso([{ ...BASE, snapshots: [
      snap("2026-08-30", { fotos: 0, salesCount: 500, price: 42 }),   // re-coleta: só miniatura
      snap("2026-08-01", { fotos: 8, salesCount: 300, price: 39 })    // enriquecimento
    ] }])
  );
  assert.equal(r.comGaleria, 1);
  const it = r.itens[0];
  assert.equal(it.fotos, 8);
  assert.equal(it.fotosDeOutroRun, true);
  // Preço e vendas são do snapshot ACTUAL, não do que tinha as fotos.
  assert.equal(it.preco, 42);
  assert.equal(it.vendas, 500);
});

test("quando o snapshot actual já tem galeria, não marca outro run", async () => {
  const r = await listEnrichedProducts(
    prismaFalso([{ ...BASE, snapshots: [snap("2026-08-30", { fotos: 6 }), snap("2026-08-01", { fotos: 8 })] }])
  );
  assert.equal(r.itens[0].fotos, 6);
  assert.equal(r.itens[0].fotosDeOutroRun, false);
});

test("URL que não é http não conta como foto", async () => {
  const p = { ...BASE, snapshots: [{ ...snap("2026-08-30"), pdpImages: ["data:image/gif;base64,x", "placeholder", null, "https://cdn/ok.jpg"] }] };
  const r = await listEnrichedProducts(prismaFalso([p]), { minFotos: 1 });
  assert.equal(r.itens[0].fotos, 1);
});

test("abaixo do mínimo de fotos, o produto fica de fora", async () => {
  const p = { ...BASE, snapshots: [snap("2026-08-30", { fotos: 2 })] };
  assert.equal((await listEnrichedProducts(prismaFalso([p]), { minFotos: 3 })).comGaleria, 0);
  assert.equal((await listEnrichedProducts(prismaFalso([p]), { minFotos: 2 })).comGaleria, 1);
});

test("produto sem snapshot nenhum não rebenta", async () => {
  const r = await listEnrichedProducts(prismaFalso([{ ...BASE, snapshots: [] }]));
  assert.equal(r.comGaleria, 0);
  assert.equal(r.totalEnriquecidos, 1);
});

test("ordena por vendas, do maior para o menor", async () => {
  const r = await listEnrichedProducts(prismaFalso([
    { ...BASE, productId: "a", snapshots: [snap("2026-08-30", { fotos: 5, salesCount: 10 })] },
    { ...BASE, productId: "b", snapshots: [snap("2026-08-30", { fotos: 5, salesCount: 900 })] }
  ]));
  assert.deepEqual(r.itens.map((i) => i.productId), ["b", "a"]);
});
