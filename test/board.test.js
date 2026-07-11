import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateBoard, adjacency, edgeKey } from '../js/board.js';
import { deepClone } from '../js/util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(readFileSync(join(__dirname, '../content/board.json'), 'utf8'));

test('sample board is valid', () => {
  assert.equal(validateBoard(board), true);
});

test('sample board: every entry→exit path crosses a chokepoint', () => {
  // validateBoard enforces this; assert it does not throw.
  assert.doesNotThrow(() => validateBoard(board));
});

test('adjacency is bidirectional', () => {
  const adj = adjacency(board);
  const e = board.edges[0];
  assert.ok(adj.get(e.from).some((x) => x.to === e.to));
  assert.ok(adj.get(e.to).some((x) => x.to === e.from));
});

test('rejects an edge to a missing node', () => {
  const bad = deepClone(board);
  bad.edges.push({ from: 'X1', to: 'NOPE', laneType: 'open-sea', cost: 1 });
  assert.throws(() => validateBoard(bad), /missing node/);
});

test('rejects invalid lane type', () => {
  const bad = deepClone(board);
  bad.edges.push({ from: 'X1', to: 'X2', laneType: 'wormhole', cost: 1 });
  assert.throws(() => validateBoard(bad), /invalid laneType/);
});

test('rejects a board with no chokepoint', () => {
  const bad = deepClone(board);
  for (const n of bad.nodes) delete n.chokepoint;
  assert.throws(() => validateBoard(bad), /chokepoint/);
});

test('detects chokepoint-bypass path', () => {
  const bad = deepClone(board);
  // Add a direct entry→exit lane bypassing all chokepoints.
  bad.edges.push({ from: 'E1', to: 'X1', laneType: 'open-sea', cost: 1 });
  assert.throws(() => validateBoard(bad), /chokepoint invariant/);
});

test('edgeKey is order-independent', () => {
  assert.equal(edgeKey('A', 'B'), edgeKey('B', 'A'));
});
