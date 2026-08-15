import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../scripts/analytics/lib/categories-catalog.mjs';

test('chunkArray divide listas grandes em blocos seguros para Prisma', () => {
  const values = Array.from({ length: 5000 }, (_, i) => i);
  const chunks = chunkArray(values, 2000);

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], Array.from({ length: 2000 }, (_, i) => i));
  assert.deepEqual(chunks[1], Array.from({ length: 2000 }, (_, i) => i + 2000));
  assert.deepEqual(chunks[2], Array.from({ length: 1000 }, (_, i) => i + 4000));
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 2000);
  }
});

test('chunkArray preserva listas pequenas sem alterar ordem', () => {
  const values = [1, 2, 3, 4];
  assert.deepEqual(chunkArray(values, 10), [values]);
});
