/**
 * Regras do modo Opportunities `no_sales` vs demais modos (sem Prisma).
 * Correr: npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  snapshotMatchesBaseQuality,
  snapshotMatchesNoSalesQuality,
  snapshotMatchesSalesMode
} from "../scripts/analytics/lib/opportunities.mjs";

function snap(overrides = {}) {
  return {
    price: 99.9,
    ratingAverage: 4.6,
    ratingTotal: 10,
    salesCount: 0,
    product: { productId: "1732000000000000001", name: "X", categoryUrl: null },
    ...overrides
  };
}

describe("Opportunities no_sales vs base quality", () => {
  test("no_sales: vendas 0 com rating 0 e reviews 0 entra (qualidade própria)", () => {
    const s = snap({
      salesCount: 0,
      ratingAverage: 0,
      ratingTotal: 0
    });
    assert.equal(snapshotMatchesNoSalesQuality(s), true);
    assert.equal(snapshotMatchesSalesMode(s, "no_sales"), true);
    assert.equal(snapshotMatchesBaseQuality(s), false);
  });

  test("no_sales: vendas null com rating null entra", () => {
    const s = snap({
      salesCount: null,
      ratingAverage: null,
      ratingTotal: null
    });
    assert.equal(snapshotMatchesNoSalesQuality(s), true);
    assert.equal(snapshotMatchesSalesMode(s, "no_sales"), true);
  });

  test("no_sales: vendas > 0 não entra", () => {
    const s = snap({ salesCount: 12, ratingAverage: 0, ratingTotal: 0 });
    assert.equal(snapshotMatchesNoSalesQuality(s), true);
    assert.equal(snapshotMatchesSalesMode(s, "no_sales"), false);
  });

  test("no_sales: sem preço não entra", () => {
    const s = snap({ price: null, salesCount: 0, ratingAverage: 5, ratingTotal: 10 });
    assert.equal(snapshotMatchesNoSalesQuality(s), false);
  });

  test("no_sales: sem productId não entra", () => {
    const s = snap({ salesCount: 0, product: { productId: "  " } });
    assert.equal(snapshotMatchesNoSalesQuality(s), false);
  });

  test("classic: rating baixo continua fora (base quality)", () => {
    const s = snap({ salesCount: 50, ratingAverage: 2, ratingTotal: 100 });
    assert.equal(snapshotMatchesBaseQuality(s), false);
    assert.equal(snapshotMatchesSalesMode(s, "classic"), true);
  });

  test("low_sales: exige valor de vendas 1–99 e base quality", () => {
    const s = snap({ salesCount: 5, ratingAverage: 4.5, ratingTotal: 5 });
    assert.equal(snapshotMatchesBaseQuality(s), true);
    assert.equal(snapshotMatchesSalesMode(s, "low_sales"), true);
  });
});
