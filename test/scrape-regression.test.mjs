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
  dedupeImageUrlsByAssetId,
  dedupeImageUrlsByPathname,
  dedupePdpImageUrls,
  parseBrlishMoneyString,
  parseDiscountPercentFromPpi,
  pickPriceFromFormatStrings,
  isReviewOnlyProductNode,
  productRowRichness,
  combinePdpHeroPriceParts,
  applyPdpDomPrices
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

describe("applyPdpDomPrices", () => {
  test("com desconto no DOM: preco = sale, preco_original = de", () => {
    const n = { price: 1, original_price: 2 };
    applyPdpDomPrices(n, { sale: 59.9, listPrice: 99.9 });
    assert.equal(n.price, 59.9);
    assert.equal(n.original_price, 99.9);
  });
  test("sem riscado (listPrice null): original anulado", () => {
    const n = { price: 1, original_price: 999 };
    applyPdpDomPrices(n, { sale: 39.99, listPrice: null });
    assert.equal(n.price, 39.99);
    assert.equal(n.original_price, null);
  });
  test("listPrice <= sale: trata como sem de", () => {
    const n = { price: 10, original_price: 200 };
    applyPdpDomPrices(n, { sale: 50, listPrice: 50 });
    assert.equal(n.price, 50);
    assert.equal(n.original_price, null);
  });
  test("sale inválido: não altera", () => {
    const n = { price: 10, original_price: 5 };
    applyPdpDomPrices(n, { sale: null, listPrice: 100 });
    assert.equal(n.price, 10);
    assert.equal(n.original_price, 5);
  });
});

describe("combinePdpHeroPriceParts (PDP hero)", () => {
  test("67 + .28 = 67.28", () => {
    assert.equal(combinePdpHeroPriceParts("67", ".28"), 67.28);
  });
  test("1 + ,90 = 1.9", () => {
    assert.equal(combinePdpHeroPriceParts("1", ",90"), 1.9);
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

  test("format_price (vitrine) vence sale_format_price (variante mais barata) quando ambos existem", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "1731843713238730000",
        product_price_info: {
          origin_price: 59.9,
          min_price: 52.71,
          price: 52.71,
          sale_format_price: "R$ 52,71",
          format_price: "R$ 59,90",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 59.9);
  });

  test("format_price sem prefixo R$ (só 59,90) é lido", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          min_price: 40,
          price: 40,
          format_price: "59,90",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 59.9);
  });

  test("sem sinal de desconto, price=min e origin=de na vitrine — usa o riscado como preco atual", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          min_price: 29.99,
          price: 29.99,
          origin_price: 39.99,
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 39.99);
    assert.equal(n?.original_price, null);
    assert.equal(n?.tem_desconto, false);
  });

  test("badge e price no piso (min) — aplica o valor do % em relacao ao de", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          min_price: 39.9,
          price: 39.9,
          origin_price: 99.9,
          discount_format: "-40%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 59.94);
    assert.equal(n?.original_price, 99.9);
  });

  test("default_sku_id: preco do sku hero antes do primeiro sku (barato)", () => {
    const n = normalizeItem(
      minimalProduct({
        default_sku_id: "B",
        sku_list: [
          { sku_id: "A", price: 9.9 },
          { sku_id: "B", price: 39.99, sale_price: 39.99 }
        ],
        product_price_info: {
          min_price: 9.9,
          price: 9.9,
          origin_price: 49.0,
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 39.99);
  });

  test("badge -12%: price e min alinhados no piso, corrigir para de * (1-12%)", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          min_price: 60.55,
          price: 60.55,
          origin_price: 76.45,
          discount_format: "-12%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 67.28);
    assert.equal(n?.original_price, 76.45);
  });

  test("piso << de×(1-%): alinha ao preço do badge (ex. -45% de 99 → 54,45)", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 99,
          min_price: 38.76,
          price: 38.76,
          discount_format: "-45%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 54.45);
    assert.equal(n?.original_price, 99);
  });

  test("feed acima do anunciado no badge: desce para de×(1-%/100)", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 29.9,
          min_price: 18.9,
          price: 18.9,
          discount_format: "-50%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 14.95);
    assert.equal(n?.original_price, 29.9);
  });
});

describe("dedupePdpImageUrls", () => {
  test("remove duplicados e mantém ordem", () => {
    assert.deepEqual(
      dedupePdpImageUrls([
        "https://p16-oec-sg.example.com/a.webp?q=1",
        "https://p16-oec-sg.example.com/a.webp?q=1",
        "https://p19-oec-sg.example.com/b.webp"
      ]),
      [
        "https://p16-oec-sg.example.com/a.webp?q=1",
        "https://p19-oec-sg.example.com/b.webp"
      ]
    );
  });
});

describe("dedupeImageUrlsByPathname", () => {
  test("p16 e p19 com o mesmo path — um só (espelho CDN)", () => {
    const a =
      "https://p16-oec-va.ibyteimg.com/tos-maliva-i-x/bbc5a751~tplv-o3syd03w52-crop-webp:1024:1024.webp?dr=1";
    const b =
      "https://p19-oec-va.ibyteimg.com/tos-maliva-i-x/bbc5a751~tplv-o3syd03w52-crop-webp:1024:1024.webp?dr=2";
    assert.deepEqual(dedupeImageUrlsByPathname([a, b]), [a]);
  });
});

describe("dedupeImageUrlsByAssetId", () => {
  test("mesmo hash, resoluções tplv diferentes — um só", () => {
    const a =
      "https://p16-oec-sg.example.com/tos-x/f75ff326720d42e5af569ff71fd09095~tplv-a-crop-webp:1000:1000.webp?q=1";
    const b =
      "https://p16-oec-sg.example.com/tos-x/f75ff326720d42e5af569ff71fd09095~tplv-a-crop-webp:800:800.webp?q=2";
    assert.deepEqual(dedupeImageUrlsByAssetId([a, b]), [a]);
  });
});

describe("avaliações (rate_info)", () => {
  test("média, total e votos por estrela (campos five_star_count…)", () => {
    const n = normalizeItem(
      minimalProduct({
        rate_info: {
          score: 4.5,
          review_count: 1041,
          five_star_count: 800,
          four_star_count: 100,
          three_star_count: 68,
          two_star_count: 28,
          one_star_count: 45
        }
      }),
      brUrl
    );
    assert.ok(n);
    assert.equal(n.review_avg, 4.5);
    assert.equal(n.review_count_total, 1041);
    assert.deepEqual(n.review_star_votes, { 1: 45, 2: 28, 3: 68, 4: 100, 5: 800 });
  });

  test("histograma em array (level + count)", () => {
    const n = normalizeItem(
      minimalProduct({
        rate_info: {
          score: 4,
          review_count: 10,
          review_start_level: [
            { level: 5, count: 3 },
            { level: 4, count: 2 },
            { level: 1, count: 1 }
          ]
        }
      }),
      brUrl
    );
    assert.ok(n);
    assert.equal(n.review_count_total, 10);
    assert.deepEqual(n.review_star_votes, { 1: 1, 4: 2, 5: 3 });
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

  test("mergeProductById: junta avaliações se só uma linha tiver rate_info", () => {
    const m = new Map();
    const comAval = normalizeItem(
      minimalProduct({
        product_id: "rmerge-1",
        product_price_info: { price: 1, currency: "BRL" },
        rate_info: { score: 4.2, review_count: 99, five_star_count: 10 }
      }),
      brUrl
    );
    const ricoPreco = normalizeItem(
      minimalProduct({
        product_id: "rmerge-1",
        product_price_info: {
          origin_price: 100,
          price: 50,
          discount_format: "50%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.ok(comAval && ricoPreco);
    mergeProductById(m, comAval);
    mergeProductById(m, ricoPreco);
    const r = m.get("rmerge-1");
    assert.equal(r?.price, 50);
    assert.equal(r?.original_price, 100);
    assert.equal(r?.tem_desconto, true);
    assert.equal(r?.review_avg, 4.2);
    assert.equal(r?.review_count_total, 99);
    assert.equal(r?.review_star_votes?.[5], 10);
  });

  test("productRowRichness: preço de venda maior pesa (sem depender de original exportado)", () => {
    const a = normalizeItem(
      minimalProduct({ product_id: "p", product_price_info: { price: 1, currency: "BRL" } }),
      brUrl
    );
    const b = normalizeItem(
      minimalProduct({
        product_id: "p",
        product_price_info: { price: 20, currency: "BRL" },
        sold_info: { sold_count: 3 }
      }),
      brUrl
    );
    assert.ok(a && b);
    assert.ok(productRowRichness(b) > productRowRichness(a));
  });
});

describe("preco_estimado_vitrine (experimental, aditivo)", () => {
  test("89.9 e -56%: estimativa ≈ 39,56; preco de grelha 35,19; gaps preenchidos", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "1735058020882220157",
        product_price_info: {
          origin_price: 89.9,
          format_price: "R$ 35,19",
          min_price: 35.19,
          price: 35.19,
          discount_format: "56%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.ok(n);
    assert.equal(n.price, 35.19);
    assert.equal(n.tem_desconto, true);
    assert.equal(n.original_price, 89.9);
    assert.ok(Math.abs(n.preco_estimado_vitrine - 39.56) < 0.01);
    assert.ok(Math.abs(n.preco_gap_estimado - 4.37) < 0.01);
    assert.equal(n.preco_gap_estimado_percent, 0.0486);
    assert.ok(n && !("discount_percent" in n));
  });

  test("sem desconto no ppi: preco_estimado_vitrine null", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: { origin_price: 100, price: 50, currency: "BRL" }
      }),
      brUrl
    );
    assert.equal(n?.price, 50);
    assert.equal(n?.original_price, null);
    assert.equal(n?.tem_desconto, false);
    assert.equal(n?.preco_estimado_vitrine, null);
    assert.equal(n?.preco_gap_estimado, null);
    assert.equal(n?.preco_gap_estimado_percent, null);
  });

  test("preco_original <= preco: preco_estimado_vitrine null", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 50,
          format_price: "R$ 50,00",
          price: 50,
          min_price: 50,
          discount_format: "20%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 50);
    assert.equal(n?.original_price, null);
    assert.equal(n?.tem_desconto, false);
    assert.equal(n?.preco_estimado_vitrine, null);
  });

  test("comparação: preco final mantém a mesma regra (format_price fixa 35,19)", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "exp-est-1",
        product_price_info: {
          origin_price: 89.9,
          format_price: "R$ 35,19",
          min_price: 35.19,
          price: 35.19,
          discount_format: "56%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 35.19);
  });

  test("não exporta desconto_percent", () => {
    const n = normalizeItem(
      minimalProduct({
        product_price_info: {
          origin_price: 89.9,
          price: 35.19,
          discount_format: "56%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.ok(n);
    assert.ok(!("discount_percent" in n));
    assert.equal(n.tem_desconto, true);
  });
});

describe("tem_desconto: saída sem desconto / com desconto confiável", () => {
  test("sem discount_format: preço mantém, original e estimados null, tem_desconto false", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "no-disc-1",
        product_price_info: { price: 29.9, currency: "BRL" }
      }),
      brUrl
    );
    assert.equal(n?.price, 29.9);
    assert.equal(n?.original_price, null);
    assert.equal(n?.preco_estimado_vitrine, null);
    assert.equal(n?.preco_gap_estimado, null);
    assert.equal(n?.preco_gap_estimado_percent, null);
    assert.equal(n?.tem_desconto, false);
  });

  test("com origin no feed sem % confiável: preço mantém, original e estimados null", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "no-disc-2",
        product_price_info: { origin_price: 39.9, price: 29.9, currency: "BRL" }
      }),
      brUrl
    );
    assert.equal(n?.price, 29.9);
    assert.equal(n?.original_price, null);
    assert.equal(n?.preco_estimado_vitrine, null);
    assert.equal(n?.tem_desconto, false);
  });

  test("com desconto confiável: tem_desconto true, original e estimado como hoje", () => {
    const n = normalizeItem(
      minimalProduct({
        product_id: "disc-1",
        product_price_info: {
          origin_price: 69.0,
          price: 39.99,
          discount_format: "42%",
          currency: "BRL"
        }
      }),
      brUrl
    );
    assert.equal(n?.price, 39.99);
    assert.equal(n?.tem_desconto, true);
    assert.equal(n?.original_price, 69.0);
    const exp = Math.round(69.0 * (1 - 42 / 100) * 100) / 100;
    assert.ok(n?.preco_estimado_vitrine != null);
    assert.ok(Math.abs(n.preco_estimado_vitrine - exp) < 0.02);
  });

  test("garante preço inalterado nos cenários sem desconto (regressão)", () => {
    const a = normalizeItem(
      minimalProduct({ product_id: "x1", product_price_info: { price: 29.9, currency: "BRL" } }),
      brUrl
    );
    const b = normalizeItem(
      minimalProduct({
        product_id: "x2",
        product_price_info: { origin_price: 39.9, price: 29.9, currency: "BRL" }
      }),
      brUrl
    );
    assert.equal(a?.price, 29.9);
    assert.equal(b?.price, 29.9);
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
  test("loja_logo_urls: deduplica p16 e p19 (mesmo pathname)", () => {
    const p16 = "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-x/abc.png";
    const p19 = "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-x/abc.png";
    const o = normalizeSellerInfo({
      product_id: "1",
      seller_info: {
        seller_id: "x",
        shop_name: "L",
        shop_logo: { uri: "u1", url_list: [p16, p19] }
      }
    });
    assert.deepEqual(o?.loja_logo_urls, [p16]);
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
