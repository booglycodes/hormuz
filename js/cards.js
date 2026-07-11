// cards.js — three-deck ability-card catalog + deterministic effect interpreter.
//
// Decks:
//   - event : shared, state-changing; reshuffles when exhausted
//   - us    : US draws on its turn (abilities favoring the visible, stronger fleet)
//   - iran  : Iran draws on its turn (abilities favoring the hidden, weaker side)
//
// A card definition is DATA:
//   { id, deck, name, text, target, effect, escalation? }
// where `target` tells the UI what the player must pick before playing:
//   'none' | 'ownShip' | 'node' | 'ownAsset'
// and `effect` is a key into EFFECTS below. `escalation` (US only) marks
// cards that cost popularity to play.
//
// Effect functions receive (state, params, helpers) and MUTATE the draft
// `state` the engine hands them. Helpers provide engine-side operations so
// card logic stays declarative and the engine keeps a single source of truth
// for things like sinking a ship.

import { adjacency, isChokepoint } from './board.js';

export const CARD_CATALOG = [
  // ---------------------------- US deck ----------------------------
  {
    id: 'go_dark', deck: 'us', name: 'Go Dark', target: 'ownShip',
    text: 'Hide one of your ships from Iran for 2 turns.',
    effect: 'goDark',
  },
  {
    id: 'carrier_air_patrol', deck: 'us', name: 'Carrier Air Patrol', target: 'ownShip',
    text: 'Reveal all hidden Iranian assets on or adjacent to a chosen ship.',
    effect: 'carrierAirPatrol',
  },
  {
    id: 'minesweeper_escort', deck: 'us', name: 'Minesweeper Escort', target: 'ownShip',
    text: 'Clear one hidden mine on an edge adjacent to a chosen ship.',
    effect: 'minesweeperEscort',
  },
  {
    id: 'full_steam_ahead', deck: 'us', name: 'Full Steam Ahead', target: 'ownShip',
    text: 'A chosen ship gains +2 movement this turn.',
    effect: 'fullSteamAhead',
  },
  {
    id: 'convoy_escort', deck: 'us', name: 'Convoy Escort', target: 'ownShip',
    text: 'A chosen ship survives the next attack that would sink it.',
    effect: 'convoyEscort',
  },
  {
    id: 'rally_public_support', deck: 'us', name: 'Rally Public Support', target: 'none',
    text: 'Restore 3 popularity.',
    effect: 'rallyPublicSupport',
  },
  {
    id: 'emergency_resupply', deck: 'us', name: 'Emergency Resupply', target: 'none',
    text: 'Add a fresh reinforcement tanker at a home entry.',
    effect: 'emergencyResupply',
  },
  {
    id: 'show_of_force', deck: 'us', name: 'Show of Force', target: 'none',
    text: 'Iran cannot place new assets next turn. Costs 2 popularity (escalation).',
    effect: 'showOfForce', escalation: 2,
  },

  // ---------------------------- Iran deck --------------------------
  {
    id: 'fast_attack_swarm', deck: 'iran', name: 'Fast Attack Swarm', target: 'ownAsset',
    text: 'Immediately spring a chosen ambush against an adjacent US ship.',
    effect: 'fastAttackSwarm',
  },
  {
    id: 'naval_mine_barrage', deck: 'iran', name: 'Naval Mine Barrage', target: 'none',
    text: 'Place up to 2 extra hidden mines this turn (beyond your budget).',
    effect: 'navalMineBarrage',
  },
  {
    id: 'silent_running', deck: 'iran', name: 'Silent Running', target: 'ownAsset',
    text: 'Relocate one hidden asset to another eligible node without revealing it.',
    effect: 'silentRunning',
  },
  {
    id: 'decoy_contact', deck: 'iran', name: 'Decoy Contact', target: 'node',
    text: 'Place a fake hidden contact (a decoy that harms nothing when triggered).',
    effect: 'decoyContact',
  },
  {
    id: 'limpet_mine', deck: 'iran', name: 'Limpet Mine', target: 'none',
    text: 'Attach a delayed charge to a random US ship; it sinks in 2 turns unless cleared.',
    effect: 'limpetMine',
  },
  {
    id: 'shahed_recon', deck: 'iran', name: 'Shahed Recon', target: 'none',
    text: 'Reveal the cargo of every US ship for the rest of the game.',
    effect: 'shahedRecon',
  },
  {
    id: 'coastal_battery', deck: 'iran', name: 'Coastal Battery', target: 'node',
    text: 'Mark a node; a US ship ending its turn there next turn takes a hit.',
    effect: 'coastalBattery',
  },
  {
    id: 'propaganda_broadcast', deck: 'iran', name: 'Propaganda Broadcast', target: 'none',
    text: 'Reduce US popularity by 2.',
    effect: 'propagandaBroadcast',
  },

  // ---------------------------- Event deck (shared) ----------------
  {
    id: 'calm_seas', deck: 'event', name: 'Calm Seas', target: 'none',
    text: 'All US ships gain +1 movement next US turn.',
    effect: 'calmSeas',
  },
  {
    id: 'fog_bank', deck: 'event', name: 'Fog Bank', target: 'none',
    text: 'All US ships lose 1 movement next US turn (minimum 1).',
    effect: 'fogBank',
  },
  {
    id: 'diplomatic_win', deck: 'event', name: 'Diplomatic Win', target: 'none',
    text: 'International goodwill: US gains 2 popularity.',
    effect: 'diplomaticWin',
  },
  {
    id: 'tensions_rise', deck: 'event', name: 'Tensions Rise', target: 'none',
    text: 'Escalating rhetoric: US loses 2 popularity.',
    effect: 'tensionsRise',
  },
  {
    id: 'intel_leak', deck: 'event', name: 'Intel Leak', target: 'none',
    text: 'A source talks: reveal one random hidden Iranian asset.',
    effect: 'intelLeak',
  },
  {
    id: 'mine_drift', deck: 'event', name: 'Mine Drift', target: 'none',
    text: 'Currents shift: a random hidden mine drifts to a random adjacent node.',
    effect: 'mineDrift',
  },
];

/** Map of cardId -> definition. */
export const CARD_BY_ID = new Map(CARD_CATALOG.map((c) => [c.id, c]));

/** All card ids for a given deck (the pristine deck composition). */
export function deckComposition(deck) {
  return CARD_CATALOG.filter((c) => c.id && c.deck === deck).map((c) => c.id);
}

// ----------------------------------------------------------------------------
// Effect interpreter
// ----------------------------------------------------------------------------

/**
 * Apply a card's effect to a draft state.
 * @param {object} state draft game state (mutated)
 * @param {string} cardId
 * @param {object} params UI-supplied params (e.g. { shipId, node, assetId })
 * @param {object} helpers { board, rng, sinkShip, revealAsset, log }
 * @returns {{ ok: boolean, error?: string }}
 */
export function applyCardEffect(state, cardId, params, helpers) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return { ok: false, error: `unknown card: ${cardId}` };
  const fn = EFFECTS[card.effect];
  if (!fn) return { ok: false, error: `card ${cardId} has no effect handler` };
  return fn(state, params || {}, helpers, card);
}

const ok = () => ({ ok: true });
const fail = (error) => ({ ok: false, error });

const EFFECTS = {
  // -------- US --------
  goDark(state, p, h) {
    const ship = findShip(state, p.shipId);
    if (!ship || ship.status === 'sunk') return fail('choose a live ship');
    ship.flags.hidden = true;
    ship.flags.hiddenTurnsLeft = 2;
    h.log(`US goes dark: ${ship.id} hidden for 2 turns`, 'US');
    return ok();
  },
  carrierAirPatrol(state, p, h) {
    const ship = findShip(state, p.shipId);
    if (!ship) return fail('choose a ship');
    const adj = adjacency(h.board);
    const near = new Set([ship.node, ...(adj.get(ship.node) || []).map((e) => e.to)]);
    let n = 0;
    for (const a of state.iranAssets) {
      if (!a.revealed && a.location.kind === 'node' && near.has(a.location.ref)) {
        h.revealAsset(a); n++;
      }
      if (!a.revealed && a.location.kind === 'edge') {
        const [x, y] = a.location.ref.split('|');
        if (near.has(x) && near.has(y)) { h.revealAsset(a); n++; }
      }
    }
    h.log(`Carrier Air Patrol reveals ${n} Iranian asset(s) near ${ship.id}`);
    return ok();
  },
  minesweeperEscort(state, p, h) {
    const ship = findShip(state, p.shipId);
    if (!ship) return fail('choose a ship');
    const idx = state.iranAssets.findIndex(
      (a) => a.type === 'mine' && a.location.kind === 'edge' &&
        a.location.ref.split('|').includes(ship.node)
    );
    if (idx < 0) return fail('no adjacent mine to clear');
    const removed = state.iranAssets.splice(idx, 1)[0];
    h.log(`Minesweeper Escort clears a mine near ${ship.id} (${removed.location.ref})`);
    return ok();
  },
  fullSteamAhead(state, p, h) {
    const ship = findShip(state, p.shipId);
    if (!ship || ship.status === 'sunk') return fail('choose a live ship');
    ship.flags.bonusMove = (ship.flags.bonusMove || 0) + 2;
    h.log(`Full Steam Ahead: ${ship.id} +2 movement this turn`);
    return ok();
  },
  convoyEscort(state, p, h) {
    const ship = findShip(state, p.shipId);
    if (!ship || ship.status === 'sunk') return fail('choose a live ship');
    ship.flags.escortProtected = true;
    h.log(`Convoy Escort: ${ship.id} will survive the next attack`);
    return ok();
  },
  rallyPublicSupport(state, p, h) {
    state.popularity += 3;
    h.log('Rally Public Support: US popularity +3');
    return ok();
  },
  emergencyResupply(state, p, h) {
    const entry = h.board.nodes.find((n) => n.entry);
    if (!entry) return fail('no entry node');
    const id = `US${state.fleetCounter++}`;
    state.fleet.push({
      id, node: entry.id, cargo: state.config.perShipCargo,
      status: 'active', flags: {},
    });
    h.log(`Emergency Resupply: reinforcement tanker ${id} at ${entry.id}`);
    return ok();
  },
  showOfForce(state, p, h) {
    state.modifiers.iranPlacementBlockedTurns = 1;
    h.log('Show of Force: Iran may not place assets next turn');
    return ok();
  },

  // -------- Iran --------
  fastAttackSwarm(state, p, h) {
    const asset = state.iranAssets.find((a) => a.id === p.assetId && a.type === 'ambush');
    if (!asset) return fail('choose an ambush asset');
    const node = asset.location.ref;
    const adj = adjacency(h.board);
    const near = new Set([node, ...(adj.get(node) || []).map((e) => e.to)]);
    const target = state.fleet.find((s) => s.status !== 'sunk' && s.status !== 'delivered' && near.has(s.node));
    if (!target) return fail('no US ship adjacent to that ambush');
    h.revealAsset(asset); asset.sprung = true;
    h.sinkShip(target, `Fast Attack Swarm from ${node}`);
    return ok();
  },
  navalMineBarrage(state, p, h) {
    state.modifiers.iranExtraPlacementsThisTurn =
      (state.modifiers.iranExtraPlacementsThisTurn || 0) + 2;
    h.log('Naval Mine Barrage: Iran may place 2 extra mines this turn', 'IRAN');
    return ok();
  },
  silentRunning(state, p, h) {
    const asset = state.iranAssets.find((a) => a.id === p.assetId);
    if (!asset || asset.revealed) return fail('choose an un-revealed asset');
    if (asset.location.kind !== 'node') return fail('only node assets can relocate');
    const eligible = h.board.nodes.filter((n) => n.placementEligible &&
      n.id !== asset.location.ref &&
      !state.iranAssets.some((a) => a.location.kind === 'node' && a.location.ref === n.id));
    if (!eligible.length) return fail('no eligible relocation node');
    const dest = eligible[h.rng.nextInt(eligible.length)];
    asset.location.ref = dest.id;
    h.log('Silent Running: an Iranian asset relocated (hidden)', 'IRAN');
    return ok();
  },
  decoyContact(state, p, h) {
    if (!p.node) return fail('choose a node');
    const id = `IR${state.assetCounter++}`;
    state.iranAssets.push({
      id, type: 'decoy', location: { kind: 'node', ref: p.node },
      revealed: false, sprung: false,
    });
    h.log('Decoy Contact placed (hidden)', 'IRAN');
    return ok();
  },
  limpetMine(state, p, h) {
    const live = state.fleet.filter((s) => s.status === 'active');
    if (!live.length) return fail('no active US ship');
    const target = live[h.rng.nextInt(live.length)];
    target.flags.limpetTurnsLeft = 2;
    h.log(`Limpet Mine attached to ${target.id} (2 turns)`, 'IRAN');
    return ok();
  },
  shahedRecon(state, p, h) {
    state.modifiers.usCargoRevealed = true;
    h.log('Shahed Recon: US cargo revealed to Iran', 'IRAN');
    return ok();
  },
  coastalBattery(state, p, h) {
    if (!p.node) return fail('choose a node');
    state.nodeHazards.push({ node: p.node, side: 'IRAN', turnsLeft: 2 });
    h.log(`Coastal Battery marks ${p.node}`, 'IRAN');
    return ok();
  },
  propagandaBroadcast(state, p, h) {
    state.popularity -= 2;
    h.log('Propaganda Broadcast: US popularity -2');
    return ok();
  },

  // -------- Event (shared) --------
  calmSeas(state, p, h) {
    state.modifiers.usMoveDelta = (state.modifiers.usMoveDelta || 0) + 1;
    h.log('Event — Calm Seas: US +1 movement next turn');
    return ok();
  },
  fogBank(state, p, h) {
    state.modifiers.usMoveDelta = (state.modifiers.usMoveDelta || 0) - 1;
    h.log('Event — Fog Bank: US -1 movement next turn');
    return ok();
  },
  diplomaticWin(state, p, h) {
    state.popularity += 2;
    h.log('Event — Diplomatic Win: US popularity +2');
    return ok();
  },
  tensionsRise(state, p, h) {
    state.popularity -= 2;
    h.log('Event — Tensions Rise: US popularity -2');
    return ok();
  },
  intelLeak(state, p, h) {
    const hidden = state.iranAssets.filter((a) => !a.revealed && a.type !== 'decoy');
    if (!hidden.length) { h.log('Event — Intel Leak: nothing to reveal'); return ok(); }
    const a = hidden[h.rng.nextInt(hidden.length)];
    h.revealAsset(a);
    h.log('Event — Intel Leak: an Iranian asset revealed');
    return ok();
  },
  mineDrift(state, p, h) {
    const mines = state.iranAssets.filter((a) => a.type === 'mine' && !a.revealed && a.location.kind === 'node');
    if (!mines.length) { h.log('Event — Mine Drift: no mines drift'); return ok(); }
    const m = mines[h.rng.nextInt(mines.length)];
    const adj = adjacency(h.board);
    const opts = (adj.get(m.location.ref) || []).map((e) => e.to);
    if (opts.length) { m.location.ref = opts[h.rng.nextInt(opts.length)]; }
    h.log('Event — Mine Drift: a mine drifted');
    return ok();
  },
};

function findShip(state, shipId) {
  return state.fleet.find((s) => s.id === shipId);
}
