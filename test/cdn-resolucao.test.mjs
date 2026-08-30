import test from "node:test";
import assert from "node:assert/strict";
import { emAltaResolucao, listaEmAltaResolucao, LADO_ALVO } from "../src/scrape/cdn-resolucao.mjs";

/**
 * As fotos de avaliação são o único material com uma pessoa real a usar o
 * produto — e estavam guardadas a 300x300 porque é isso que o `<img src>` da
 * página serve. A 300x300 não enchem um fotograma 1080x1920 sem borrar.
 */

const REAL =
  "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4416fe2a1e4d4c2993174c827f4a1f63" +
  "~tplv-aphluv4xwc-crop-webp:300:300.webp?dr=15592&t=555f072d&ps=933b5bde&idc=my";

function lado(url) {
  const m = url.match(/:(\d+):(\d+)\./);
  return m ? Number(m[1]) : null;
}

test("sobe a miniatura real de 300 para o lado alvo", () => {
  assert.equal(lado(emAltaResolucao(REAL)), LADO_ALVO);
});

test("sobe também as de 100, que existiam na base", () => {
  assert.equal(lado(emAltaResolucao(REAL.replace(":300:300.", ":100:100."))), LADO_ALVO);
});

test("nunca reduz — se o CDN já dá maior, fica como está", () => {
  const grande = REAL.replace(":300:300.", ":1600:1600.");
  assert.equal(emAltaResolucao(grande), grande);
});

test("preserva a query, que o CDN usa para autorizar", () => {
  // Perder `?dr=...&t=...` dá 403 e a foto desaparece — pior do que borrada.
  assert.ok(emAltaResolucao(REAL).endsWith("?dr=15592&t=555f072d&ps=933b5bde&idc=my"));
});

test("URL sem o molde do CDN passa intacta", () => {
  // Inventar parâmetros num CDN que não conhecemos dá 404, e um 404 aqui
  // custa a foto inteira.
  for (const u of ["https://x/foto.jpg", "https://y/a~tplv-z.webp", ""]) {
    assert.equal(emAltaResolucao(u), u);
  }
});

test("o que não é string sai como entrou", () => {
  for (const v of [null, undefined, 42, {}]) assert.equal(emAltaResolucao(v), v);
});

test("a lista converte item a item e não mexe no que não é lista", () => {
  const r = listaEmAltaResolucao([REAL, "https://x/foto.jpg"]);
  assert.equal(lado(r[0]), LADO_ALVO);
  assert.equal(r[1], "https://x/foto.jpg");
  assert.equal(listaEmAltaResolucao(null), null);
});
