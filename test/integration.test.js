import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initGame, applyAction } from '../js/engine.js';
import { adjacency } from '../js/board.js';
import { CARD_BY_ID } from '../js/cards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(readFileSync(join(__dirname, '../content/board.json'), 'utf8'));

/** BFS one step toward the nearest exit from `start`. */
function stepToward(adj, start, exits) {
  const prev = new Map([[start, null]]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    if (exits.has(cur) && cur !== start) {
      let n = cur;
      while (prev.get(n) !== start) n = prev.get(n);
      return n; // first hop on the path
    }
    for (const { to } of adj.get(cur) || []) {
      if (!prev.has(to)) { prev.set(to, cur); q.push(to); }
    }
  }
  return null;
}

function apply(state, action) {
  const r = applyAction(state, action);
  assert.ok(r.ok, `action failed: ${JSON.stringify(action)} → ${r.error}`);
  return r.state;
}

test('full playthrough: US delivers oil across many turns and wins', () => {
  let s = initGame(board, {}, 12345); // default config: target 12, fleet 4, cargo 5
  const adj = adjacency(board);
  const exits = new Set(board.nodes.filter((n) => n.exit).map((n) => n.id));

  // Iran places nothing (clear run) then ends setup.
  s = apply(s, { type: 'END_SETUP' });

  let guard = 0;
  while (!s.terminal && guard++ < 200) {
    if (s.turn.activeSide === 'US') {
      // Move each active ship up to its allowance toward the nearest exit.
      let moved = true;
      while (moved) {
        moved = false;
        for (const ship of s.fleet.filter((f) => f.status === 'active')) {
          const used = s.turnMoveSteps[ship.id] || 0;
          const allowance = s.config.movementAllowance + (s.turn.moveDelta || 0) + (ship.flags.bonusMove || 0);
          if (used >= allowance) continue;
          const next = stepToward(adj, ship.node, exits);
          if (next) {
            const r = applyAction(s, { type: 'MOVE_SHIP', side: 'US', shipId: ship.id, toNode: next });
            if (r.ok) { s = r.state; moved = true; }
          }
        }
        if (s.terminal) break;
      }
      if (!s.terminal) s = apply(s, { type: 'END_TURN', side: 'US' });
    } else {
      // Iran: play a no-target card if held, else just end.
      const card = (s.hands.IRAN || []).find((id) => CARD_BY_ID.get(id)?.target === 'none');
      if (card) {
        const r = applyAction(s, { type: 'PLAY_CARD', side: 'IRAN', cardId: card, params: {} });
        if (r.ok) s = r.state;
      }
      if (!s.terminal) s = apply(s, { type: 'END_TURN', side: 'IRAN' });
    }
  }

  assert.ok(s.terminal, `game should terminate (guard=${guard})`);
  assert.equal(s.terminal.winner, 'US');
  assert.equal(s.terminal.reason, 'US_OIL_TARGET');
  assert.ok(s.oilDelivered > s.config.oilTargetX);
});

test('deterministic: same seed → identical outcome', () => {
  const play = () => {
    let s = initGame(board, {}, 999);
    s = applyAction(s, { type: 'END_SETUP' }).state;
    // End 3 full rounds without moving.
    for (let i = 0; i < 3 && !s.terminal; i++) {
      s = applyAction(s, { type: 'END_TURN', side: 'US' }).state;
      s = applyAction(s, { type: 'END_TURN', side: 'IRAN' }).state;
    }
    return s;
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.equal(a.popularity, b.popularity);
  assert.deepEqual(a.decks, b.decks);
});
