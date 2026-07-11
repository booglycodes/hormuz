import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, nextInt, nextFloat, shuffle, cloneRng } from '../js/rng.js';

test('same seed → identical nextInt sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(nextInt(a, 1000), nextInt(b, 1000));
});

test('different seeds → different sequences (very likely)', () => {
  const a = makeRng(1), b = makeRng(2);
  let same = true;
  for (let i = 0; i < 20; i++) if (nextInt(a, 1e6) !== nextInt(b, 1e6)) same = false;
  assert.equal(same, false);
});

test('string seeds are supported and deterministic', () => {
  const a = makeRng('hormuz'), b = makeRng('hormuz');
  assert.equal(nextFloat(a), nextFloat(b));
});

test('nextInt stays in range [0, max)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = nextInt(r, 13);
    assert.ok(v >= 0 && v < 13);
  }
});

test('shuffle is deterministic and a permutation', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const s1 = shuffle(makeRng(9), arr);
  const s2 = shuffle(makeRng(9), arr);
  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort((a, b) => a - b), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8]); // input unchanged
});

test('cloneRng isolates state', () => {
  const a = makeRng(5);
  const b = cloneRng(a);
  assert.equal(nextInt(a, 100), nextInt(b, 100));
});
