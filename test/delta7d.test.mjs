import test from "node:test";
import assert from "node:assert/strict";
import { calcularDelta } from "../scripts/lib/calcular-delta7d.mjs";

/**
 * O `delta7d` responde "esquentando?" e é um dos critérios que decide em que
 * produtos os 80 créditos do Symphony são gastos. Um delta inflacionado manda
 * crédito para produto morno; um delta em falta esconde produto a subir.
 *
 * A regra sensível é qual snapshot serve de base — errar ali dá sempre um
 * número, e um número errado não se denuncia sozinho.
 */

const AGORA = new Date("2026-08-30T12:00:00Z");
const diasAtras = (n) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

test("delta simples entre hoje e ha 7 dias", () => {
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 1200 },
      { capturedAt: diasAtras(7), salesCount: 1000 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, 200);
});

test("escolhe a leitura mais proxima dos 7 dias, nao a mais antiga", () => {
  // Com a mais antiga (30 dias), o "delta de 7 dias" viraria "delta desde
  // sempre" e o nome deixaria de dizer a verdade.
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 1200 },
      { capturedAt: diasAtras(8), salesCount: 1000 },
      { capturedAt: diasAtras(30), salesCount: 100 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, 200);
});

test("a folga aguenta coleta atrasada", () => {
  // Leitura de 9 dias atras ainda serve (7 + 3 de folga). Sem folga, uma
  // coleta que atrasou um dia deixaria a base inteira sem delta.
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 500 },
      { capturedAt: diasAtras(9), salesCount: 450 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, 50);
});

test("fora da janela devolve null, nao zero", () => {
  // "nao medimos" e diferente de "nao vendeu".
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 500 },
      { capturedAt: diasAtras(40), salesCount: 100 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, null);
  assert.match(r.motivo, /janela/);
});

test("uma leitura so nao da delta", () => {
  const r = calcularDelta({ snapshots: [{ capturedAt: AGORA, salesCount: 500 }], agora: AGORA });
  assert.equal(r.delta, null);
});

test("sem leitura nenhuma nao rebenta", () => {
  assert.equal(calcularDelta({ snapshots: [], agora: AGORA }).delta, null);
  assert.equal(calcularDelta({ agora: AGORA }).delta, null);
});

test("contador que desce devolve null — nao um negativo", () => {
  // salesCount e cumulativo (0 quedas em 18.005 pares medidos). Se descer, o
  // dado e suspeito; devolver o negativo mentiria sobre "esquentando".
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 800 },
      { capturedAt: diasAtras(7), salesCount: 1000 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, null);
  assert.match(r.motivo, /desceu/);
});

test("delta zero e um resultado valido — o produto parou", () => {
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 1000 },
      { capturedAt: diasAtras(7), salesCount: 1000 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, 0);
  assert.equal(r.motivo, "ok");
});

test("snapshot sem salesCount e ignorado, nao conta como zero", () => {
  const r = calcularDelta({
    snapshots: [
      { capturedAt: AGORA, salesCount: 1200 },
      { capturedAt: diasAtras(6), salesCount: null },
      { capturedAt: diasAtras(7), salesCount: 1000 }
    ],
    agora: AGORA
  });
  assert.equal(r.delta, 200);
});
