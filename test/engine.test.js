import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initGame, applyAction, SIDES } from '../js/engine.js';
import { projectView } from '../js/view.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(readFileSync(join(__dirname, '../content/board.json'), 'utf8'));

/** apply and assert success, returning the new state */
function step(state, action) {
  const r = applyAction(state, action);
  assert.ok(r.ok, `action ${JSON.stringify(action)} should succeed: ${r.error}`);
  return r.state;
}

test('initGame produces a valid setup state', () => {
  const s = initGame(board, { fleetSize: 4 });
  assert.equal(s.phase, 'iran_setup');
  assert.equal(s.fleet.length, 4);
  assert.equal(s.turn.activeSide, SIDES.IRAN);
  assert.ok(s.fleet.every((f) => f.status === 'active'));
});

test('applyAction is pure (does not mutate input)', () => {
  const s = initGame(board, {});
  const snapshot = JSON.stringify(s);
  const r = applyAction(s, { type: 'END_SETUP' });
  assert.ok(r.ok);
  assert.notEqual(r.state, s);
  assert.equal(JSON.stringify(s), snapshot, 'input state must be unchanged');
});

test('illegal action returns error and unchanged state', () => {
  const s = initGame(board, {});
  // Cannot move ships during Iran setup.
  const r = applyAction(s, { type: 'MOVE_SHIP', side: 'US', shipId: 'US1', toNode: 'W1' });
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
});

test('US delivers oil and wins on oil target', () => {
  // High allowance so one ship crosses in a single turn; low target so one delivery wins.
  let s = initGame(board, {
    fleetSize: 1, perShipCargo: 5, oilTargetX: 4,
    movementAllowance: 6, popularity: { start: 100, perShipLossCost: 2 },
  });
  s = step(s, { type: 'END_SETUP' });
  // Path E1 → W1 → W4 → C1 → Ea1 → X1 (5 steps), all real edges crossing chokepoint C1.
  const path = ['W1', 'W4', 'C1', 'Ea1', 'X1'];
  for (const to of path) s = step(s, { type: 'MOVE_SHIP', side: 'US', shipId: 'US1', toNode: to });
  assert.equal(s.oilDelivered, 5);
  assert.ok(s.terminal, 'game should be terminal');
  assert.equal(s.terminal.winner, 'US');
  assert.equal(s.terminal.reason, 'US_OIL_TARGET');
});

test('a hidden mine on an edge sinks a transiting ship and costs popularity', () => {
  let s = initGame(board, {
    fleetSize: 2, perShipCargo: 5, oilTargetX: 8,
    movementAllowance: 6, popularity: { start: 10, perShipLossCost: 2 },
  });
  // Iran mines the E1–W1 edge, then ends setup.
  s = step(s, { type: 'PLACE_ASSET', side: 'IRAN', assetType: 'mine', location: { kind: 'edge', ref: 'E1|W1' } });
  s = step(s, { type: 'END_SETUP' });
  const popBefore = s.popularity;
  s = step(s, { type: 'MOVE_SHIP', side: 'US', shipId: 'US1', toNode: 'W1' });
  const us1 = s.fleet.find((f) => f.id === 'US1');
  assert.equal(us1.status, 'sunk');
  assert.equal(s.popularity, popBefore - 2);
  const mine = s.iranAssets[0];
  assert.equal(mine.revealed, true);
});

test('Iran wins on the clock if US never reaches the target', () => {
  let s = initGame(board, {
    fleetSize: 4, perShipCargo: 5, oilTargetX: 4, clockLength: 1,
    popularity: { start: 100, perShipLossCost: 2 },
  });
  s = step(s, { type: 'END_SETUP' });            // round 1, US turn
  s = step(s, { type: 'END_TURN', side: 'US' });  // → Iran turn
  s = step(s, { type: 'END_TURN', side: 'IRAN' }); // round advances to 2 > maxTurns 1
  assert.ok(s.terminal);
  assert.equal(s.terminal.winner, 'IRAN');
  assert.equal(s.terminal.reason, 'IRAN_CLOCK');
});

test('view projection hides un-revealed Iran assets from US, shows to Iran', () => {
  let s = initGame(board, { fleetSize: 2, oilTargetX: 6, popularity: { start: 100 } });
  s = step(s, { type: 'PLACE_ASSET', side: 'IRAN', assetType: 'mine', location: { kind: 'node', ref: 'C1' } });

  const usView = projectView(s, 'US');
  const iranView = projectView(s, 'IRAN');
  assert.equal(usView.iranAssets.length, 0, 'US must not see hidden assets');
  assert.equal(iranView.iranAssets.length, 1, 'Iran sees its own asset');

  // Log must not leak the hidden placement to US.
  assert.ok(!usView.log.some((e) => /places a hidden/.test(e.msg)));
  assert.ok(iranView.log.some((e) => /places a hidden/.test(e.msg)));
});

test('a revealed asset becomes visible to US via projection', () => {
  let s = initGame(board, {
    fleetSize: 2, perShipCargo: 5, oilTargetX: 8,
    movementAllowance: 6, popularity: { start: 100 },
  });
  s = step(s, { type: 'PLACE_ASSET', side: 'IRAN', assetType: 'mine', location: { kind: 'edge', ref: 'E1|W1' } });
  s = step(s, { type: 'END_SETUP' });
  s = step(s, { type: 'MOVE_SHIP', side: 'US', shipId: 'US1', toNode: 'W1' });
  const usView = projectView(s, 'US');
  assert.equal(usView.iranAssets.length, 1, 'US now sees the sprung mine');
  assert.equal(usView.iranAssets[0].revealed, true);
});

test('Go Dark hides a US ship from the Iran view', () => {
  let s = initGame(board, { fleetSize: 2, oilTargetX: 6, popularity: { start: 100 } });
  s = step(s, { type: 'END_SETUP' });
  // Force a Go Dark into the US hand for determinism.
  s.hands.US.push('go_dark');
  const r = applyAction(s, { type: 'PLAY_CARD', side: 'US', cardId: 'go_dark', params: { shipId: 'US1' } });
  assert.ok(r.ok, r.error);
  const iranView = projectView(r.state, 'IRAN');
  assert.ok(!iranView.fleet.some((f) => f.id === 'US1'), 'US1 hidden from Iran');
  const usView = projectView(r.state, 'US');
  assert.ok(usView.fleet.some((f) => f.id === 'US1'), 'US still sees US1');
});

test('placement budget is enforced', () => {
  let s = initGame(board, { fleetSize: 2, oilTargetX: 6 });
  // per-type mine budget default = 3; 4th mine should fail.
  const spots = ['C1', 'C2', 'W4', 'W5'];
  let ok = 0;
  for (const ref of spots) {
    const r = applyAction(s, { type: 'PLACE_ASSET', side: 'IRAN', assetType: 'mine', location: { kind: 'node', ref } });
    if (r.ok) { s = r.state; ok++; }
  }
  assert.equal(ok, 3, 'only 3 mines allowed by per-type budget');
});
