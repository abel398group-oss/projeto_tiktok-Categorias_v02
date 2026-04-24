/**
 * Contrato do parser de categoria: preço de vitrine, dedupe, reviews, loja (sem % de desconto na saída).
 * Correr: npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  mergeProductById,
  normalizeItem,
  normalizeSellerInfo,
  parseBrlishMoneyString,
  parseDiscountPercentFromPpi,
  pickPriceFromFormatStrings,
  isReviewOnlyProductNode,
  productRowRichness
} from "../src/scrapeCategory.mjs";

const brUrl = "https://shop.tiktok.com/br/c/test/1";

function minimalProduct(overrides = {}) {
  return {
    product_id: "1732000000000000001",
    title: "Produto de teste",
    image: { url: "https://p16-oec-sg.ibyteimg.com/placeholder~tplv.jpg" },
    ...overrides
  };
}

describe("parseDiscountPercentFromPpi", () => {
  test("lê badge com sinal -", () => {
    assert.equal(parseDiscountPercentFromPpi({ discount_format: "-57%" }), 57);
  });
  test("lê % sem sinal", () => {
    assert.equal(parseDiscountPercentFromPpi({ discount_format: "25%" }), 25);
  });
  test("discount_decimal 0,25 = 25%", () => {
    assert.equal(parseDiscountPercentFromPpi({ discount_decimal: 0.25 }), 25);
  });
});

describe("parseBrlishMoneyString / pickPriceFromFormatStrings", () => {
  test("BRL com vírgula decimal", () => {
    assert.equal(parseBrlishMoneyString("R$ 59,90"), 59.9);
  });
  test("format em object", () => {
    const n = pickPriceFromFormatStrings({ format_price: "R$ 49,99" });
    assert.equal(n, 49.99);
  });
});

describe("normalizeItem — preço (grelha, sem desconto % na saída)", () => {
  test("prefere product_price_info.price ao min_price (variante mais barata)", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "1732671611141915996",
        product_price_info: {
          origin_price: 199.99,
          min_price: 67,
          price: 86,
          discount_format: "-57%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 86);
    assert.equal(n?.original_price, 199.99);
    assert.ok(n && !("discount_percent" in n) && !("discount_format_text" in n));
  });

  test("par riscado + preço: ppi vence, desconto não exportado", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 79.98,
          min_price: 52.71,
          price: 59.9,
          discount: 34,
          discount_format: "25%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 59.9);
    assert.equal(n?.original_price, 79.98);
    assert.ok(n && !("discount_percent" in n));
  });

  test("string format_price vence min_price se existir", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 69.99,
          min_price: 43.99,
          format_price: "R$ 49,99",
          discount_format: "29%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 49.99);
    assert.ok(n && !("discount_percent" in n));
  });
});

describe("reviews e dedupe", () => {
  test("nó com review_id não vira produto", () => {
    assert.equal(
      normalizeItem(
        minimalProduct({
          review_id: "r1",
          product_name: "Título de review"
        }),
        brUrl
      ),
      null
    );
  });
  test("isReviewOnlyProductNode", () => {
    assert.equal(isReviewOnlyProductNode({ review_id: 1 }), true);
    assert.equal(isReviewOnlyProductNode({ product_id: "1" }), false);
  });

  test("mergeProductById mantém a linha mais rica (preço+original)", () => {
    const m = new Map();
    const poor = normalizeItem(
      minimalProduct({ product_id: "same", product_price_info: { price: 1, currency: "BRL" } }),
      brUrl
    );
    const rich = normalizeItem(
      minimalProduct({
        product_id: "same",
        product_price_info: {
          origin_price: 100,
          price: 50,
          discount_format: "50%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.ok(poor && rich);
    mergeProductById(m, poor);
    mergeProductById(m, rich);
    assert.equal(m.size, 1);
    assert.equal(m.get("same")?.price, 50);
    assert.equal(m.get("same")?.original_price, 100);
  });

  test("productRowRichness: linha com preço+original > só preço mínimo", () => {
    const a = normalizeItem(
      minimalProduct({ product_id: "p", product_price_info: { price: 1, currency: "BRL" } }),
      brUrl
    );
    const b = normalizeItem(
      minimalProduct({
        product_id: "p",
        product_price_info: { origin_price: 10, price: 5, currency: "BRL" }
      }),
      brUrl
    );
    assert.ok(a && b);
    assert.ok(productRowRichness(b) > productRowRichness(a));
  });
});

describe("normalizeSellerInfo / loja", () => {
  test("seller_info.shop_name → nome_loja", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      seller_info: { seller_id: "S1", shop_name: "MinhaLoja" }
    });
    assert.equal(o?.nome_loja, "MinhaLoja");
    assert.equal(o?.seller_id, "S1");
  });
  test("seller_info.shop_logo.url_list → loja_logo_urls", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      seller_info: {
        seller_id: "x",
        shop_name: "L",
        shop_logo: { uri: "u1", url_list: ["https://a.com/1.png", "https://a.com/2.png"] }
      }
    });
    assert.deepEqual(o?.loja_logo_urls, ["https://a.com/1.png", "https://a.com/2.png"]);
    assert.equal(o?.loja_logo_uri, "u1");
  });
  test("shop_info: sold_count → loja_vendas_total", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      shop_info: { seller_id: "1", sold_count: 1010, shop_name: "L" }
    });
    assert.equal(o?.loja_vendas_total, 1010);
  });
  test("shop_info: on_sell → loja_produtos_ativos, review_count → loja_reviews_total", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      shop_info: { seller_id: "1", on_sell_product_count: 18, review_count: 97, shop_name: "s" }
    });
    assert.equal(o?.loja_produtos_ativos, 18);
    assert.equal(o?.loja_reviews_total, 97);
  });
  test("shop_info: followers, videos", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      shop_info: { seller_id: "1", followers_count: 42, video_count: 32, shop_name: "s" }
    });
    assert.equal(o?.loja_seguidores, 42);
    assert.equal(o?.loja_videos, 32);
  });
  test("review_id: não gera loja (null)", () => {
    assert.equal(
      normalizeSellerInfo({
        review_id: "r1",
        seller_info: { seller_id: "9", shop_name: "X" }
      }),
      null
    );
  });
  test("reviewer_name não vira nome_loja", () => {
    const o = normalizeSellerInfo({
      product_id: "1",
      reviewer_name: "Fulano",
      seller_info: { seller_id: "1", shop_name: "LojaOficial" }
    });
    assert.equal(o?.nome_loja, "LojaOficial");
  });
  test("mergeProductById não apaga nome_loja quando o novo item vem com nome_loja null", () => {
    const m = new Map();
    const withLoja = normalizeItem(
      minimalProduct({
        product_id: "merge-loja-1",
        product_price_info: { price: 1, currency: "BRL" },
        seller_info: { seller_id: "S", shop_name: "LojaA" }
      }),
      brUrl
    );
    const noLojaNome = normalizeItem(
      minimalProduct({
        product_id: "merge-loja-1",
        product_price_info: { origin_price: 20, price: 10, discount_format: "50%", currency: "BRL" }
      }),
      brUrl
    );
    assert.ok(withLoja && noLojaNome);
    mergeProductById(m, withLoja);
    mergeProductById(m, noLojaNome);
    const r = m.get("merge-loja-1");
    assert.equal(r?.price, 10);
    assert.equal(r?.nome_loja, "LojaA");
  });
});
