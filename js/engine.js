// engine.js — pure, deterministic, headless rules engine.
//
// No DOM, no network, no UI imports. `applyAction(state, action)` returns a
// NEW state (never mutates the input). The engine is the single authoritative
// writer of game state and the only place win/lose is decided.
//
// Turn model:
//   phase 'iran_setup' : Iran places hidden assets (within budget), then END_SETUP.
//   phase 'playing'    : sides alternate. On a side's turn start it draws; on the
//                        US turn start a shared Event card is drawn and applied.
//                        US moves ships / plays cards; Iran places/plays cards.
//                        END_TURN passes control; ending Iran's turn advances the clock.
//   phase 'over'       : terminal set.
//
// Win precedence (checked after every applied action):
//   1 US_OIL_TARGET  (oilDelivered > X)
//   2 IRAN_POPULARITY (popularity <= 0)
//   3 IRAN_CLOCK      (round > clockLength)
//   4 IRAN_ATTRITION  (no US ship can still deliver and oil <= X)

import { makeRng, nextInt, shuffle, cloneRng } from './rng.js';
import { makeConfig } from './config.js';
import { validateBoard, adjacency, edgeKey, isExit } from './board.js';
import { CARD_BY_ID, deckComposition, applyCardEffect } from './cards.js';
import { deepClone } from './util.js';

export const SIDES = { US: 'US', IRAN: 'IRAN' };

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Create a fresh game state.
 * @param {object} board board content object
 * @param {object} [configOverride] partial config override
 * @param {number|string} [seed] RNG seed (defaults to config.seed)
 */
export function initGame(board, configOverride = {}, seed) {
  validateBoard(board);
  const config = makeConfig(configOverride);
  const rng = makeRng(seed ?? config.seed);

  // Fleet: distribute ships across entry nodes.
  const entries = board.nodes.filter((n) => n.entry).map((n) => n.id);
  const fleet = [];
  for (let i = 0; i < config.fleetSize; i++) {
    fleet.push({
      id: `US${i + 1}`,
      node: entries[i % entries.length],
      cargo: config.perShipCargo,
      status: 'active',          // 'active' | 'delivered' | 'sunk'
      flags: {},
    });
  }

  const decks = {
    event: { draw: shuffle(rng, deckComposition('event')), discard: [] },
    us: { draw: shuffle(rng, deckComposition('us')), discard: [] },
    iran: { draw: shuffle(rng, deckComposition('iran')), discard: [] },
  };

  const state = {
    config,
    board,
    phase: 'iran_setup',
    turn: { number: 1, maxTurns: config.clockLength, activeSide: SIDES.IRAN, moveDelta: 0 },
    fleet,
    fleetCounter: config.fleetSize + 1,
    iranAssets: [],
    assetCounter: 1,
    oilDelivered: 0,
    popularity: config.popularity.start,
    decks,
    hands: { US: [], IRAN: [] },
    modifiers: {
      usMoveDelta: 0,
      iranPlacementBlockedTurns: 0,
      iranExtraPlacementsThisTurn: 0,
      usCargoRevealed: false,
    },
    nodeHazards: [],
    turnMoveSteps: {},
    rng,
    log: [],
    terminal: null,
  };

  // Opening hands.
  deal(state, SIDES.US, config.draw.handSize);
  deal(state, SIDES.IRAN, config.draw.handSize);

  logMsg(state, 'Game start — Iran places hidden assets.');
  return state;
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

/**
 * Apply an action to the state. Pure: returns { state, ok, error }.
 * On failure the returned state is the (unchanged) input state.
 */
export function applyAction(prev, action) {
  if (prev.terminal) return done(prev, 'game is over');
  const state = clone(prev);

  const handlers = {
    PLACE_ASSET: hPlaceAsset,
    END_SETUP: hEndSetup,
    MOVE_SHIP: hMoveShip,
    PLAY_CARD: hPlayCard,
    END_TURN: hEndTurn,
  };
  const fn = handlers[action?.type];
  if (!fn) return done(prev, `unknown action: ${action?.type}`);

  const res = fn(state, action);
  if (!res.ok) return done(prev, res.error);

  evaluateTerminal(state);
  return { state, ok: true };
}

// ---------------------------------------------------------------------------
// Action handlers  (mutate the draft `state`; return {ok} or {ok:false,error})
// ---------------------------------------------------------------------------

function hPlaceAsset(state, a) {
  if (a.side !== SIDES.IRAN) return err('only Iran places assets');
  const inSetup = state.phase === 'iran_setup';
  const inTurn = state.phase === 'playing' && state.turn.activeSide === SIDES.IRAN;
  if (!inSetup && !inTurn) return err('not Iran’s placement window');
  if (!inSetup && state.modifiers.iranPlacementBlockedTurns > 0) {
    return err('Iran is blocked from placing this turn (Show of Force)');
  }

  const type = a.assetType;
  if (!['mine', 'ambush', 'sensor'].includes(type)) return err(`bad asset type: ${type}`);

  // Budget: total + per-type, plus any extra granted this turn (barrage → mines only).
  const placed = state.iranAssets.filter((x) => x.type !== 'decoy');
  const extra = type === 'mine' ? (state.modifiers.iranExtraPlacementsThisTurn || 0) : 0;
  const totalCap = state.config.placementBudget.total + extra;
  if (placed.length >= totalCap) return err('placement budget exhausted');
  const perType = state.config.placementBudget.perType[type] ?? 0;
  const ofType = placed.filter((x) => x.type === type).length;
  if (ofType >= perType + (type === 'mine' ? extra : 0)) return err(`per-type budget for ${type} exhausted`);

  const loc = a.location;
  if (!loc || (loc.kind !== 'node' && loc.kind !== 'edge')) return err('bad location');
  if (!locationExists(state.board, loc)) return err('location not on board');
  if (loc.kind === 'node') {
    const node = state.board.nodes.find((n) => n.id === loc.ref);
    if (!node?.placementEligible) return err('node not placement-eligible');
    if (state.iranAssets.some((x) => x.location.kind === 'node' && x.location.ref === loc.ref)) {
      return err('node already occupied by an asset');
    }
  } else {
    if (type !== 'mine') return err('only mines can be placed on edges');
    if (state.iranAssets.some((x) => x.location.kind === 'edge' && x.location.ref === loc.ref)) {
      return err('edge already mined');
    }
  }

  state.iranAssets.push({
    id: `IR${state.assetCounter++}`,
    type,
    location: { kind: loc.kind, ref: loc.ref },
    revealed: false,
    sprung: false,
  });
  if (extra && type === 'mine') state.modifiers.iranExtraPlacementsThisTurn--;
  logMsg(state, `Iran places a hidden ${type}.`, 'IRAN');
  return ok();
}

function hEndSetup(state) {
  if (state.phase !== 'iran_setup') return err('not in setup');
  state.phase = 'playing';
  state.turn.activeSide = SIDES.US;
  state.turn.number = 1;
  beginTurn(state);
  logMsg(state, 'Setup complete — US turn 1.');
  return ok();
}

function hMoveShip(state, a) {
  if (state.phase !== 'playing') return err('not in play');
  if (state.turn.activeSide !== SIDES.US) return err('not US turn');
  const ship = state.fleet.find((s) => s.id === a.shipId);
  if (!ship) return err('no such ship');
  if (ship.status !== 'active') return err(`ship ${ship.id} cannot move (${ship.status})`);

  const adj = adjacency(state.board);
  const edge = (adj.get(ship.node) || []).find((e) => e.to === a.toNode);
  if (!edge) return err(`no lane from ${ship.node} to ${a.toNode}`);

  const allowance = shipAllowance(state, ship);
  const used = state.turnMoveSteps[ship.id] || 0;
  if (used >= allowance) return err(`${ship.id} has no movement left`);

  const from = ship.node;
  ship.node = a.toNode;
  state.turnMoveSteps[ship.id] = used + 1;
  logMsg(state, `${ship.id} moves ${from} → ${a.toNode}.`);

  // Trigger any hidden asset on the traversed edge, then on the destination node.
  triggerEdge(state, ship, from, a.toNode);
  if (ship.status === 'active') triggerNode(state, ship, a.toNode);

  // Delivery (only if still afloat) — sink precedes bank.
  if (ship.status === 'active' && isExitNode(state.board, a.toNode)) {
    state.oilDelivered += ship.cargo;
    ship.status = 'delivered';
    logMsg(state, `${ship.id} delivers ${ship.cargo} oil (total ${state.oilDelivered}/${state.config.oilTargetX}).`);
  }
  return ok();
}

function hPlayCard(state, a) {
  if (state.phase !== 'playing') return err('not in play');
  const side = a.side;
  if (side !== state.turn.activeSide) return err('not your turn');
  const hand = state.hands[side];
  const idx = hand.indexOf(a.cardId);
  if (idx < 0) return err('card not in hand');
  const card = CARD_BY_ID.get(a.cardId);
  if (!card) return err('unknown card');
  const expectedDeck = side === SIDES.US ? 'us' : 'iran';
  if (card.deck !== expectedDeck) return err('cannot play that card');

  const helpers = makeHelpers(state);
  const res = applyCardEffect(state, a.cardId, a.params, helpers);
  if (!res.ok) return err(res.error);

  if (card.escalation) {
    state.popularity -= card.escalation;
    logMsg(state, `${card.name} escalation cost: -${card.escalation} popularity.`);
  }

  hand.splice(idx, 1);
  state.decks[card.deck].discard.push(a.cardId);
  return ok();
}

function hEndTurn(state, a) {
  if (state.phase !== 'playing') return err('not in play');
  if (a.side !== state.turn.activeSide) return err('not your turn');

  const ending = state.turn.activeSide;
  if (ending === SIDES.US) applyEndOfUsTurnHazards(state);

  if (ending === SIDES.US) {
    state.turn.activeSide = SIDES.IRAN;
  } else {
    state.turn.activeSide = SIDES.US;
    state.turn.number += 1;
  }
  beginTurn(state);
  return ok();
}

// ---------------------------------------------------------------------------
// Turn upkeep
// ---------------------------------------------------------------------------

function beginTurn(state) {
  const side = state.turn.activeSide;
  state.turnMoveSteps = {};

  if (side === SIDES.US) {
    state.turn.moveDelta = state.modifiers.usMoveDelta || 0;
    state.modifiers.usMoveDelta = 0;

    for (const ship of state.fleet) {
      if (ship.status !== 'active') continue;
      if (ship.flags.bonusMove) ship.flags.bonusMove = 0;
      if (ship.flags.hidden) {
        ship.flags.hiddenTurnsLeft = (ship.flags.hiddenTurnsLeft || 0) - 1;
        if (ship.flags.hiddenTurnsLeft <= 0) {
          ship.flags.hidden = false;
          delete ship.flags.hiddenTurnsLeft;
          logMsg(state, `${ship.id} is visible again.`);
        }
      }
      if (ship.flags.limpetTurnsLeft) {
        ship.flags.limpetTurnsLeft -= 1;
        if (ship.flags.limpetTurnsLeft <= 0) sinkShip(state, ship, 'Limpet Mine detonates');
      }
    }
    drawAndApplyEvent(state);
    if (state.modifiers.iranPlacementBlockedTurns > 0) state.modifiers.iranPlacementBlockedTurns--;
    for (const hz of state.nodeHazards) hz.turnsLeft--;
    state.nodeHazards = state.nodeHazards.filter((hz) => hz.turnsLeft > 0);
  } else {
    state.modifiers.iranExtraPlacementsThisTurn = 0;
  }

  deal(state, side, state.config.draw.cadence);
}

function drawAndApplyEvent(state) {
  const cardId = drawFrom(state, 'event');
  if (!cardId) return;
  const helpers = makeHelpers(state);
  applyCardEffect(state, cardId, {}, helpers);
  state.decks.event.discard.push(cardId);
}

// ---------------------------------------------------------------------------
// Triggering hidden assets
// ---------------------------------------------------------------------------

function triggerEdge(state, ship, from, to) {
  const key = edgeKey(from, to);
  const asset = state.iranAssets.find(
    (x) => !x.revealed && x.location.kind === 'edge' && x.location.ref === key
  );
  if (asset) resolveAssetTrigger(state, ship, asset);
}

function triggerNode(state, ship, nodeId) {
  const asset = state.iranAssets.find(
    (x) => !x.revealed && x.location.kind === 'node' && x.location.ref === nodeId
  );
  if (asset) resolveAssetTrigger(state, ship, asset);
}

function resolveAssetTrigger(state, ship, asset) {
  asset.revealed = true;
  asset.sprung = true;
  if (asset.type === 'mine' || asset.type === 'ambush') {
    sinkShip(state, ship, `${asset.type} at ${asset.location.ref}`);
  } else if (asset.type === 'sensor') {
    state.modifiers.usCargoRevealed = true;
    logMsg(state, `${ship.id} tripped a sensor — Iran gains intel.`);
  } else if (asset.type === 'decoy') {
    logMsg(state, `${ship.id} investigated a decoy — nothing there.`);
  }
}

// ---------------------------------------------------------------------------
// Ship loss + hazards
// ---------------------------------------------------------------------------

function sinkShip(state, ship, reason) {
  if (ship.status !== 'active') return;
  if (ship.flags.escortProtected) {
    ship.flags.escortProtected = false;
    logMsg(state, `${ship.id} survives (${reason}) — escort absorbs the hit.`);
    return;
  }
  ship.status = 'sunk';
  state.popularity -= state.config.popularity.perShipLossCost;
  logMsg(state, `${ship.id} SUNK (${reason}). US popularity -${state.config.popularity.perShipLossCost}.`);
}

function applyEndOfUsTurnHazards(state) {
  for (const ship of state.fleet) {
    if (ship.status !== 'active') continue;
    const hz = state.nodeHazards.find((h) => h.node === ship.node);
    if (hz) sinkShip(state, ship, `coastal battery at ${ship.node}`);
  }
}

// ---------------------------------------------------------------------------
// Terminal evaluation (win precedence)
// ---------------------------------------------------------------------------

export function evaluateTerminal(state) {
  if (state.terminal) return state.terminal;
  if (state.phase === 'iran_setup') return null;

  if (state.oilDelivered > state.config.oilTargetX) {
    return setTerminal(state, SIDES.US, 'US_OIL_TARGET');
  }
  if (state.popularity <= 0) {
    return setTerminal(state, SIDES.IRAN, 'IRAN_POPULARITY');
  }
  if (state.turn.number > state.turn.maxTurns) {
    return setTerminal(state, SIDES.IRAN, 'IRAN_CLOCK');
  }
  const canStillDeliver = state.fleet.some((s) => s.status === 'active');
  if (!canStillDeliver && state.oilDelivered <= state.config.oilTargetX) {
    return setTerminal(state, SIDES.IRAN, 'IRAN_ATTRITION');
  }
  return null;
}

function setTerminal(state, winner, reason) {
  state.terminal = { winner, reason };
  state.phase = 'over';
  logMsg(state, `GAME OVER — ${winner} wins (${reason}).`);
  return state.terminal;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shipAllowance(state, ship) {
  return Math.max(1, state.config.movementAllowance + (state.turn.moveDelta || 0) + (ship.flags.bonusMove || 0));
}

function isExitNode(board, nodeId) {
  const n = board.nodes.find((x) => x.id === nodeId);
  return !!n && isExit(n);
}

function locationExists(board, loc) {
  if (loc.kind === 'node') return board.nodes.some((n) => n.id === loc.ref);
  const [a, b] = loc.ref.split('|');
  return board.edges.some((e) => edgeKey(e.from, e.to) === edgeKey(a, b));
}

/** Draw up to n cards from a side's own deck into hand (respecting hand size). */
function deal(state, side, n) {
  const deckName = side === SIDES.US ? 'us' : 'iran';
  for (let i = 0; i < n; i++) {
    if (state.hands[side].length >= state.config.draw.handSize) break;
    const c = drawFrom(state, deckName);
    if (!c) break;
    state.hands[side].push(c);
  }
}

/** Draw one card id from a deck; reshuffle discard into draw when empty. */
function drawFrom(state, deckName) {
  const deck = state.decks[deckName];
  if (deck.draw.length === 0) {
    if (deck.discard.length === 0) return null;
    deck.draw = shuffle(state.rng, deck.discard);
    deck.discard = [];
    logMsg(state, `${deckName} deck reshuffled.`);
  }
  return deck.draw.shift();
}

function makeHelpers(state) {
  return {
    board: state.board,
    rng: { nextInt: (n) => nextInt(state.rng, n) },
    sinkShip: (ship, reason) => sinkShip(state, ship, reason),
    revealAsset: (asset) => { asset.revealed = true; },
    log: (m, vis) => logMsg(state, m, vis),
  };
}

// vis: 'all' (both sides see it), 'US' or 'IRAN' (only that side sees it).
function logMsg(state, msg, vis = 'all') {
  state.log.push({ turn: state.turn?.number ?? 0, side: state.turn?.activeSide ?? '-', msg, vis });
}

function clone(state) {
  return deepClone(state);
}

const ok = () => ({ ok: true });
const err = (error) => ({ ok: false, error });
function done(prevState, error) { return { state: prevState, ok: false, error }; }

export { cloneRng };
