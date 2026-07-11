// board.js — board graph helpers + validator.
//
// A board is a plain object: { id, name, nodes[], edges[] }.
//   node: { id, label, x, y, entry?, exit?, chokepoint?, placementEligible? }
//   edge: { from, to, laneType, cost }   (edges are UNDIRECTED / bidirectional)
//
// Lane types carry the maritime flavor and can be used by rules/UI.

export const LANE_TYPES = ['open-sea', 'coastal', 'narrow-channel'];

/** Build a fast lookup of nodeId -> node. */
export function nodeMap(board) {
  const m = new Map();
  for (const n of board.nodes) m.set(n.id, n);
  return m;
}

/**
 * Build an undirected adjacency map: nodeId -> [{ to, laneType, cost, edge }].
 * Each edge contributes an entry in both directions.
 */
export function adjacency(board) {
  const adj = new Map();
  for (const n of board.nodes) adj.set(n.id, []);
  for (const e of board.edges) {
    adj.get(e.from)?.push({ to: e.to, laneType: e.laneType, cost: e.cost ?? 1, edge: e });
    adj.get(e.to)?.push({ to: e.from, laneType: e.laneType, cost: e.cost ?? 1, edge: e });
  }
  return adj;
}

/** Canonical, order-independent key for an (undirected) edge. */
export function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const isEntry = (node) => !!node.entry;
export const isExit = (node) => !!node.exit;
export const isChokepoint = (node) => !!node.chokepoint;

/** List neighbor node ids reachable from `nodeId` in one step. */
export function neighbors(board, nodeId, adj = adjacency(board)) {
  return (adj.get(nodeId) || []).map((e) => e.to);
}

/**
 * Validate a board. Throws with an aggregated message if invalid.
 * Checks: unique ids, valid lane types, edges reference existing nodes,
 * at least one entry/exit/chokepoint, every exit reachable from some entry,
 * and the core invariant: EVERY entry->exit path crosses a chokepoint.
 */
export function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') throw new Error('board must be an object');
  if (!Array.isArray(board.nodes) || !Array.isArray(board.edges)) {
    throw new Error('board must have nodes[] and edges[]');
  }

  const ids = new Set();
  for (const n of board.nodes) {
    if (!n.id) errors.push('node missing id');
    if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }

  for (const e of board.edges) {
    if (!ids.has(e.from)) errors.push(`edge references missing node: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`edge references missing node: ${e.to}`);
    if (!LANE_TYPES.includes(e.laneType)) {
      errors.push(`edge ${e.from}->${e.to} has invalid laneType: ${e.laneType}`);
    }
  }

  const entries = board.nodes.filter(isEntry).map((n) => n.id);
  const exits = board.nodes.filter(isExit).map((n) => n.id);
  const chokepoints = new Set(board.nodes.filter(isChokepoint).map((n) => n.id));
  if (entries.length === 0) errors.push('board has no entry nodes');
  if (exits.length === 0) errors.push('board has no exit nodes');
  if (chokepoints.size === 0) errors.push('board has no chokepoint nodes');

  // Bail before graph traversal if structural errors exist.
  if (errors.length) {
    throw new Error('Invalid board:\n  - ' + errors.join('\n  - '));
  }

  const adj = adjacency(board);

  // (a) every exit reachable from some entry
  const reachableFromEntries = bfsReachable(adj, entries, null);
  for (const x of exits) {
    if (!reachableFromEntries.has(x)) {
      errors.push(`exit ${x} is not reachable from any entry`);
    }
  }

  // (b) core invariant: removing chokepoints disconnects every entry from every exit.
  //     If any exit is still reachable from an entry without passing a chokepoint,
  //     the invariant is violated.
  const reachableAvoidingChokes = bfsReachable(adj, entries, chokepoints);
  for (const x of exits) {
    if (reachableAvoidingChokes.has(x)) {
      errors.push(
        `chokepoint invariant violated: exit ${x} is reachable from an entry without crossing a chokepoint`
      );
    }
  }

  if (errors.length) {
    throw new Error('Invalid board:\n  - ' + errors.join('\n  - '));
  }
  return true;
}

/**
 * BFS reachable set from a set of sources, optionally treating `blocked`
 * node ids as impassable (they are not traversed *through*, and are not
 * added to the reachable set).
 */
function bfsReachable(adj, sources, blocked) {
  const seen = new Set();
  const queue = [];
  for (const s of sources) {
    if (blocked && blocked.has(s)) continue;
    seen.add(s);
    queue.push(s);
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const { to } of adj.get(cur) || []) {
      if (blocked && blocked.has(to)) continue;
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return seen;
}
