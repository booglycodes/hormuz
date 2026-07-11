// view.js — projectView(state, side): the single concealment mechanism.
//
// Returns a filtered, serializable copy of the game state containing only what
// `side` ('US' | 'IRAN') is allowed to see. Used identically by the hot-seat
// controller (to gate what is rendered after a Swap Sides) and by the online
// host (to decide what to send to the thin client). Never mutates input.
//
// Concealment rules:
//   US view:
//     - Iran's UN-revealed assets are omitted entirely (mines/ambush/sensors/decoys).
//     - Iran's hidden node hazards (Coastal Battery) are omitted until they fire.
//     - Iran's hand and the raw deck ordering are hidden (counts only).
//   Iran view:
//     - US ships currently "gone dark" (flags.hidden) are omitted.
//     - US ship cargo is hidden unless Iran has intel (modifiers.usCargoRevealed).
//     - US hand and raw deck ordering are hidden (counts only).
//   Both:
//     - Internal RNG state is never exposed.
//     - The event log is filtered by each entry's `vis` tag.

const OPP = { US: 'IRAN', IRAN: 'US' };

/**
 * @param {object} state authoritative game state
 * @param {'US'|'IRAN'} side viewer
 * @returns {object} PlayerView
 */
export function projectView(state, side) {
  const opp = OPP[side];

  const view = {
    viewer: side,
    phase: state.phase,
    turn: { ...state.turn },
    board: state.board,
    config: state.config,
    oilDelivered: state.oilDelivered,
    popularity: state.popularity,          // US-only concept; shown to both (Iran sees the meter it targets)
    terminal: state.terminal ? { ...state.terminal } : null,
    nodeHazards: [],
    iranAssets: [],
    fleet: [],
    hands: {},
    deckCounts: deckCounts(state),
    turnMoveSteps: { ...state.turnMoveSteps },
    modifiers: {
      usMoveDelta: state.modifiers.usMoveDelta,
      iranPlacementBlockedTurns: state.modifiers.iranPlacementBlockedTurns,
      usCargoRevealed: state.modifiers.usCargoRevealed,
    },
    log: state.log.filter((e) => (e.vis ?? 'all') === 'all' || e.vis === side),
  };

  // ---- Fleet ----
  for (const ship of state.fleet) {
    if (side === 'IRAN' && ship.flags.hidden) continue; // gone dark: invisible to Iran
    const s = {
      id: ship.id,
      node: ship.node,
      status: ship.status,
      flags: filterShipFlags(ship.flags, side),
    };
    // Cargo: US always sees own; Iran only with intel.
    if (side === 'US' || state.modifiers.usCargoRevealed) s.cargo = ship.cargo;
    view.fleet.push(s);
  }

  // ---- Iran assets ----
  for (const a of state.iranAssets) {
    if (side === 'IRAN' || a.revealed) {
      view.iranAssets.push({
        id: a.id, type: a.type, location: { ...a.location },
        revealed: a.revealed, sprung: a.sprung,
      });
    }
    // US sees nothing about un-revealed assets.
  }

  // ---- Node hazards (hidden Iran markers) ----
  if (side === 'IRAN') {
    view.nodeHazards = state.nodeHazards.map((h) => ({ ...h }));
  } // US never sees hidden coastal batteries pre-trigger

  // ---- Hands ----
  view.hands[side] = [...state.hands[side]];
  view.hands[opp] = { count: state.hands[opp].length }; // opponent hand size only

  return view;
}

function filterShipFlags(flags, side) {
  const out = {};
  // Public-ish flags both may see.
  if (flags.escortProtected) out.escortProtected = true;
  if (flags.bonusMove) out.bonusMove = flags.bonusMove;
  if (side === 'US') {
    // US sees its own covert/limpet state.
    if (flags.hidden) { out.hidden = true; out.hiddenTurnsLeft = flags.hiddenTurnsLeft; }
    if (flags.limpetTurnsLeft) out.limpetTurnsLeft = flags.limpetTurnsLeft;
  }
  return out;
}

function deckCounts(state) {
  const c = {};
  for (const k of Object.keys(state.decks)) {
    c[k] = { draw: state.decks[k].draw.length, discard: state.decks[k].discard.length };
  }
  return c;
}
