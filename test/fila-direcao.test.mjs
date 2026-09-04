import test from "node:test";
import assert from "node:assert/strict";
import { compararNaFila } from "../scripts/scrape-all-categories.mjs";

/**
 * A ordem da fila decide onde a noite de coleta é gasta — e, desde que há 80
 * gerações de vídeo no Symphony, também onde o crédito é gasto.
 *
 * O que se protege aqui é a hierarquia: a direção do dono é conhecimento que
 * os dados não têm, por isso vence "nunca medida" e vence a oportunidade
 * medida. Se alguém inverter esses critérios um dia, o sintoma seria uma
 * categoria marcada como interesse a nunca chegar ao topo — sem erro nenhum.
 */

const cat = (nome) => ({ nome });

function ordenar(nomes, { direcao = {}, rendimento = {}, peso = {} } = {}) {
  return [...nomes.map(cat)]
    .sort(
      compararNaFila({
        direcaoDe: (c) => direcao[c.nome] ?? 0,
        rendimentoDe: (c) => (c.nome in rendimento ? rendimento[c.nome] : null),
        pesoDe: (c) => (c.nome in peso ? peso[c.nome] : null)
      })
    )
    .map((c) => c.nome);
}

test("interesse do dono vem primeiro, mesmo contra categoria nunca medida", () => {
  // Sem direção, "nunca medida" (b) ganharia — descobrir vem antes de refrescar.
  const r = ordenar(["a", "b"], { direcao: { a: 1 }, rendimento: { a: 5 } });
  assert.deepEqual(r, ["a", "b"]);
});

test("interesse vence oportunidade medida alta", () => {
  const r = ordenar(["a", "b"], {
    direcao: { a: 1 },
    rendimento: { a: 10, b: 10 },
    peso: { a: 0, b: 3 }
  });
  assert.deepEqual(r, ["a", "b"]);
});

test("sem direcao, nunca medida vem antes de ja medida", () => {
  const r = ordenar(["medida", "nova"], { rendimento: { medida: 100 } });
  assert.deepEqual(r, ["nova", "medida"]);
});

test("entre medidas, maior oportunidade primeiro", () => {
  const r = ordenar(["fraca", "forte"], {
    rendimento: { fraca: 50, forte: 50 },
    peso: { fraca: 1, forte: 3 }
  });
  assert.deepEqual(r, ["forte", "fraca"]);
});

test("com oportunidade empatada, a mais produtiva primeiro", () => {
  const r = ordenar(["pouca", "muita"], {
    rendimento: { pouca: 10, muita: 90 },
    peso: { pouca: 2, muita: 2 }
  });
  assert.deepEqual(r, ["muita", "pouca"]);
});

test("categoria com oportunidade conhecida vence a que nao tem", () => {
  const r = ordenar(["sem", "com"], {
    rendimento: { sem: 80, com: 10 },
    peso: { com: 1 }
  });
  assert.deepEqual(r, ["com", "sem"]);
});

test("a ordenacao e estavel para elementos totalmente empatados", () => {
  const r = ordenar(["a", "b", "c"], { rendimento: { a: 5, b: 5, c: 5 }, peso: { a: 1, b: 1, c: 1 } });
  assert.deepEqual(r, ["a", "b", "c"]);
});
