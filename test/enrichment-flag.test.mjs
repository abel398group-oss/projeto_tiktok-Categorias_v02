import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeEnrichmentBaseHashFromItem,
  extractEnrichmentFromDataQuality
} from "../scripts/lib/import-output-core.mjs";

describe("enrichment flag", () => {
  test("baseHash ignores query string and keeps stable for same core fields", () => {
    const a = {
      nome: "Produto X",
      seller_id: "S1",
      preco: 19.9,
      preco_original: null,
      fotos: [
        "https://cdn.example.com/a.webp?x=1",
        "https://cdn.example.com/b.webp?y=2",
        "https://cdn.example.com/c.webp?z=3"
      ]
    };
    const b = {
      nome: "Produto X",
      seller_id: "S1",
      preco: 19.9,
      preco_original: null,
      fotos: [
        "https://cdn.example.com/a.webp?x=999",
        "https://cdn.example.com/b.webp?y=888",
        "https://cdn.example.com/c.webp?z=777"
      ]
    };
    const ha = computeEnrichmentBaseHashFromItem(a);
    const hb = computeEnrichmentBaseHashFromItem(b);
    assert.equal(ha, hb);
  });

  test("baseHash changes when relevant fields change (price)", () => {
    const a = { nome: "Produto X", seller_id: "S1", preco: 19.9, preco_original: null, fotos: ["https://x/a.webp"] };
    const b = { nome: "Produto X", seller_id: "S1", preco: 20.9, preco_original: null, fotos: ["https://x/a.webp"] };
    assert.notEqual(computeEnrichmentBaseHashFromItem(a), computeEnrichmentBaseHashFromItem(b));
  });

  test("extractEnrichmentFromDataQuality reads enriched payload when present", () => {
    const dq = { enrichment: { status: "enriched", baseHash: "abc", at: "2026-01-01T00:00:00.000Z", source: "pdp" } };
    assert.deepEqual(extractEnrichmentFromDataQuality(dq), {
      status: "enriched",
      baseHash: "abc",
      at: "2026-01-01T00:00:00.000Z",
      source: "pdp"
    });
  });
});

