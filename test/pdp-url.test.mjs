import test from "node:test";
import assert from "node:assert/strict";
import { productIdDeUrl, itemMinimoDeUrl, eLinkEncurtado, resolverEncurtado } from "../src/scrape/pdp-url.mjs";

/**
 * Descobrir produto a navegar é caso de uso real — vê-se algo bom na app,
 * copia-se o link. Antes disto o `pdp:enrich` só aceitava id, e um produto
 * ainda não colhido não tinha caminho nenhum: respondia "não existe no output
 * nem na base" e ficava por ali.
 */

test("extrai o id dos formatos de link que aparecem na prática", () => {
  const casos = [
    ["https://shop.tiktok.com/br/pdp/1730000000000000000", "1730000000000000000"],
    ["https://www.tiktok.com/shop/br/pdp/meia-bota-nautica/1731234567890123456", "1731234567890123456"],
    ["https://www.tiktok.com/view/product/1732222222222222222?source=x", "1732222222222222222"]
  ];
  for (const [url, esperado] of casos) assert.equal(productIdDeUrl(url), esperado);
});

test("id nu passa como está", () => {
  assert.equal(productIdDeUrl("1733333333333333333"), "1733333333333333333");
  assert.equal(productIdDeUrl("  1733333333333333333  "), "1733333333333333333");
});

test("lê o id da query quando é lá que ele está", () => {
  assert.equal(productIdDeUrl("https://x.com/p?id=1734444444444444444"), "1734444444444444444");
  assert.equal(productIdDeUrl("https://x.com/p?product_id=1734444444444444444"), "1734444444444444444");
});

test("link encurtado devolve null — não dá para resolver sem seguir o redireccionamento", () => {
  // Devolver um palpite aqui faria o enriquecimento visitar a PDP errada.
  assert.equal(productIdDeUrl("https://vt.tiktok.com/ZSABCDEF/"), null);
});

test("não inventa id a partir de números curtos", () => {
  for (const v of ["lixo", "https://x.com/p/123", "", null, undefined, 42]) {
    assert.equal(productIdDeUrl(v), null);
  }
});

test("o item mínimo não inventa dados que a PDP vai trazer", () => {
  const it = itemMinimoDeUrl("1730000000000000000", "https://shop.tiktok.com/br/pdp/1730000000000000000");
  assert.equal(it.product_id, "1730000000000000000");
  assert.equal(it.link_produto, "https://shop.tiktok.com/br/pdp/1730000000000000000");
  // Nome, preço e galeria ficam nulos: valores falsos à espera de sobrescrita
  // são pior do que ausência declarada.
  for (const campo of ["nome", "preco", "vendas", "fotos", "fotos_pdp"]) {
    assert.equal(it[campo], null, campo);
  }
});

test("sem link, monta a URL canónica a partir do id", () => {
  assert.equal(
    itemMinimoDeUrl("1730000000000000000").link_produto,
    "https://shop.tiktok.com/br/pdp/1730000000000000000"
  );
});

test("reconhece os encurtadores do TikTok", () => {
  assert.equal(eLinkEncurtado("https://vt.tiktok.com/ZS9BQ5oRJmqCQ-I61XG/"), true);
  assert.equal(eLinkEncurtado("https://vm.tiktok.com/ZS9ABC/"), true);
  assert.equal(eLinkEncurtado("https://shop.tiktok.com/br/pdp/1730000000000000000"), false);
  assert.equal(eLinkEncurtado("lixo"), false);
});

test("resolve o encurtado pelo primeiro salto que traz id", async () => {
  // O segundo salto real vai para /login, que não tem id. Parar no primeiro
  // que dá id é de propósito — seguir até ao fim perdia o produto.
  const saltos = [
    "https://shop.tiktok.com/br/pdp/1734383733939013197?share=1",
    "https://www.tiktok.com/login?redirect_url=x"
  ];
  let i = 0;
  const fetchFalso = async () => ({ headers: { get: () => saltos[i++] ?? null } });
  assert.equal(
    await resolverEncurtado("https://vt.tiktok.com/ZS9/", { fetchImpl: fetchFalso }),
    "1734383733939013197"
  );
});

test("desiste em vez de adivinhar quando nenhum salto tem id", async () => {
  const fetchFalso = async () => ({ headers: { get: () => "https://www.tiktok.com/login" } });
  assert.equal(
    await resolverEncurtado("https://vt.tiktok.com/ZS9/", { fetchImpl: fetchFalso, maxSaltos: 3 }),
    null
  );
});

test("rede em baixo devolve null, não rebenta", async () => {
  const fetchFalso = async () => { throw new Error("ENOTFOUND"); };
  assert.equal(await resolverEncurtado("https://vt.tiktok.com/ZS9/", { fetchImpl: fetchFalso }), null);
});
