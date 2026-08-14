/**
 * Crescimento medido em ritmo (vendas/dia), não em total acumulado.
 *
 * Dois bugs que estes testes travam:
 *
 * 1. A base de comparação era o run imediatamente anterior. Medido nesta base:
 *    coletas seguidas ficavam a 0,4 h umas das outras — em 24 minutos ninguém
 *    vende nada, então `deltaVendas` era zero para toda a gente e o ranking
 *    nunca via crescimento nenhum.
 * 2. O delta cru não é comparável entre produtos: 50 vendas em 12 h e 50 vendas
 *    em 7 dias pontuavam igual, apesar de serem ritmos 14× diferentes.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeProductScoreLine } from "../scripts/analytics/lib/product-score.mjs";

/** Snapshot mínimo para o cálculo. */
function snap({ vendas, ref = "p1" }) {
  return {
    productRefId: ref,
    salesCount: vendas,
    ratingAverage: 4.9,
    ratingTotal: 100,
    price: 50,
    hasDiscount: false,
    dataQuality: null,
    product: { productId: "1", name: "Produto", productUrl: "", categoryUrl: null, seller: null }
  };
}

/** Contexto com base de comparação a `horas` de distância. */
function ctx({ vendasAntes, horas, ref = "p1" }) {
  return {
    prevPorRef: new Map([[ref, vendasAntes]]),
    count: 2,
    previous: { id: "run-base" },
    janelaHoras: horas
  };
}

describe("vendas/dia — ritmo em vez de total acumulado", () => {
  test("100 vendas em 24 h dão 100/dia", () => {
    const l = computeProductScoreLine(snap({ vendas: 600 }), ctx({ vendasAntes: 500, horas: 24 }));
    assert.equal(l.vendasPorDia, 100);
    assert.equal(l.crescimentoMedido, true);
  });

  test("as mesmas 100 vendas em 96 h dão 25/dia — 4× menos ritmo", () => {
    const l = computeProductScoreLine(snap({ vendas: 600 }), ctx({ vendasAntes: 500, horas: 96 }));
    assert.equal(l.vendasPorDia, 25);
  });

  test("mesmo delta, janelas diferentes → pontuações diferentes", () => {
    const rapido = computeProductScoreLine(snap({ vendas: 600 }), ctx({ vendasAntes: 500, horas: 12 }));
    const lento = computeProductScoreLine(snap({ vendas: 600 }), ctx({ vendasAntes: 500, horas: 240 }));
    assert.ok(
      rapido.score > lento.score,
      "vender 100 unidades em 12 h tem de valer mais que as mesmas 100 em 10 dias"
    );
  });

  test("a janela viaja junto com o número", () => {
    const l = computeProductScoreLine(snap({ vendas: 600 }), ctx({ vendasAntes: 500, horas: 48 }));
    assert.equal(l.janelaHoras, 48);
  });
});

describe("sem base fiável, não se inventa crescimento", () => {
  test("sem janela conhecida, o crescimento fica sem base", () => {
    const l = computeProductScoreLine(
      snap({ vendas: 600 }),
      { prevPorRef: new Map([["p1", 500]]), count: 2, previous: { id: "r" }, janelaHoras: null }
    );
    assert.equal(l.vendasPorDia, null);
    assert.equal(l.crescimentoMedido, false);
    assert.match(l.motivos, /sem base de crescimento/);
  });

  test("sem leitura anterior, o crescimento fica sem base", () => {
    const l = computeProductScoreLine(
      snap({ vendas: 600 }),
      { prevPorRef: new Map(), count: 1, previous: null, janelaHoras: 48 }
    );
    assert.equal(l.vendasPorDia, null);
    assert.equal(l.crescimentoMedido, false);
  });

  test("produto parado tem ritmo zero, e isso é uma medição — não ausência dela", () => {
    const l = computeProductScoreLine(snap({ vendas: 500 }), ctx({ vendasAntes: 500, horas: 48 }));
    assert.equal(l.vendasPorDia, 0);
    assert.equal(l.crescimentoMedido, true);
  });
});
