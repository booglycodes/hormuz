// ui.js — SVG board renderer + interaction.
//
// GameUI renders a PlayerView (from projectView) into the DOM and emits action
// intents through an onIntent(action) callback. It holds only transient
// selection state (selected ship / pending card / placement type); all game
// state lives in the engine. It never mutates game state directly.

const SVG_NS = 'http://www.w3.org/2000/svg';

const LANE_STYLE = {
  'open-sea': { stroke: '#3a6ea5', width: 3, dash: '' },
  'coastal': { stroke: '#5fa8d3', width: 3, dash: '4 3' },
  'narrow-channel': { stroke: '#c1666b', width: 4, dash: '' },
};

const ASSET_GLYPH = { mine: '✸', ambush: '⚔', sensor: '◎', decoy: '?' };

export class GameUI {
  /**
   * @param {{board: HTMLElement, panel: HTMLElement}} els
   * @param {(action:object)=>void} onIntent
   */
  constructor(els, onIntent) {
    this.boardEl = els.board;
    this.panelEl = els.panel;
    this.onIntent = onIntent;
    this.view = null;
    this.sel = { shipId: null, cardId: null, placeType: null, msg: '' };
  }

  setView(view) {
    this.view = view;
    // Reset transient selection that no longer applies.
    if (view.phase !== 'playing') this.sel.shipId = null;
    this.render();
  }

  flash(msg) { this.sel.msg = msg; this.renderPanel(); }

  // ---- top-level render ----
  render() {
    if (!this.view) return;
    this.renderBoard();
    this.renderPanel();
  }

  // ---- SVG board ----
  renderBoard() {
    const v = this.view;
    const board = v.board;
    const svg = el('svg', { class: 'board-svg', xmlns: SVG_NS });
    const maxX = Math.max(...board.nodes.map((n) => n.x)) + 60;
    const maxY = Math.max(...board.nodes.map((n) => n.y)) + 60;
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const nodeById = new Map(board.nodes.map((n) => [n.id, n]));

    // Edges
    for (const e of board.edges) {
      const a = nodeById.get(e.from), b = nodeById.get(e.to);
      const st = LANE_STYLE[e.laneType] || LANE_STYLE['open-sea'];
      const line = el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: st.stroke, 'stroke-width': st.width,
        'stroke-dasharray': st.dash, class: 'lane',
        'data-edge': edgeKey(e.from, e.to),
      });
      // Mines can be placed on edges during Iran placement.
      if (this.canPlaceOnEdge()) {
        line.classList.add('clickable');
        line.addEventListener('click', () => this.onEdgeClick(edgeKey(e.from, e.to)));
      }
      svg.appendChild(line);

      // Revealed edge assets (e.g. sprung mine) rendered at edge midpoint.
      const asset = (v.iranAssets || []).find(
        (x) => x.location.kind === 'edge' && x.location.ref === edgeKey(e.from, e.to)
      );
      if (asset) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        svg.appendChild(text(mx, my + 5, ASSET_GLYPH[asset.type] || '?', {
          class: `asset asset-${asset.type} ${asset.revealed ? 'revealed' : 'hidden'}`,
          'text-anchor': 'middle',
        }));
      }
    }

    // Nodes
    for (const n of board.nodes) {
      const g = el('g', { class: 'node-group' });
      const cls = ['node'];
      if (n.entry) cls.push('entry');
      if (n.exit) cls.push('exit');
      if (n.chokepoint) cls.push('chokepoint');
      const c = el('circle', {
        cx: n.x, cy: n.y, r: 16, class: cls.join(' '), 'data-node': n.id,
      });
      if (this.isNodeClickable(n)) {
        c.classList.add('clickable');
        c.addEventListener('click', () => this.onNodeClick(n.id));
      }
      g.appendChild(c);
      g.appendChild(text(n.x, n.y - 22, n.label, { class: 'node-label', 'text-anchor': 'middle' }));

      // Node-based Iran asset marker (own view or revealed)
      const nodeAsset = (v.iranAssets || []).find(
        (x) => x.location.kind === 'node' && x.location.ref === n.id
      );
      if (nodeAsset) {
        const t = text(n.x + 14, n.y - 10, ASSET_GLYPH[nodeAsset.type] || '?', {
          class: `asset asset-${nodeAsset.type} ${nodeAsset.revealed ? 'revealed' : 'hidden'}`,
          'text-anchor': 'middle',
        });
        if (this.canTargetOwnAsset()) {
          t.classList.add('clickable');
          t.addEventListener('click', (ev) => { ev.stopPropagation(); this.onAssetClick(nodeAsset.id); });
        }
        g.appendChild(t);
      }

      // Hidden coastal-battery hazard (Iran view only — projection strips it for US)
      if ((v.nodeHazards || []).some((h) => h.node === n.id)) {
        g.appendChild(text(n.x - 14, n.y - 10, '▲', { class: 'hazard', 'text-anchor': 'middle' }));
      }

      svg.appendChild(g);
    }

    // Ships (grouped by node, offset when stacked)
    const byNode = new Map();
    for (const s of v.fleet) {
      if (s.status === 'sunk' || s.status === 'delivered') continue;
      if (!byNode.has(s.node)) byNode.set(s.node, []);
      byNode.get(s.node).push(s);
    }
    for (const [nodeId, ships] of byNode) {
      const n = nodeById.get(nodeId);
      ships.forEach((s, i) => {
        const ox = (i - (ships.length - 1) / 2) * 14;
        const shipCls = ['ship'];
        if (this.sel.shipId === s.id) shipCls.push('selected');
        if (s.flags?.hidden) shipCls.push('hidden');
        if (s.flags?.escortProtected) shipCls.push('escort');
        const rect = el('rect', {
          x: n.x + ox - 8, y: n.y + 18, width: 16, height: 10, rx: 2,
          class: shipCls.join(' '), 'data-ship': s.id,
        });
        rect.addEventListener('click', (ev) => { ev.stopPropagation(); this.onShipClick(s.id); });
        svg.appendChild(rect);
        svg.appendChild(text(n.x + ox, n.y + 40, s.id.replace('US', 'T'), {
          class: 'ship-label', 'text-anchor': 'middle',
        }));
      });
    }

    this.boardEl.replaceChildren(svg);
  }

  // ---- side panel: HUD, hand, controls, log ----
  renderPanel() {
    const v = this.view;
    const p = el('div', { class: 'panel-inner' });

    const myTurn = v.phase !== 'over' &&
      ((v.phase === 'iran_setup' && v.viewer === 'IRAN') ||
       (v.phase === 'playing' && v.turn.activeSide === v.viewer));

    // HUD
    const hud = el('div', { class: 'hud' });
    hud.appendChild(kv('Viewing as', v.viewer));
    hud.appendChild(kv('Phase', v.phase));
    hud.appendChild(kv('Turn', `${v.turn.number} / ${v.turn.maxTurns}`));
    hud.appendChild(kv('Active', v.turn.activeSide));
    hud.appendChild(kv('Oil delivered', `${v.oilDelivered} / ${v.config.oilTargetX} (need > ${v.config.oilTargetX})`));
    hud.appendChild(kv('US popularity', String(v.popularity)));
    const afloat = v.fleet.filter((s) => s.status === 'active').length;
    hud.appendChild(kv('US ships afloat', String(afloat)));
    p.appendChild(hud);

    // Terminal banner
    if (v.terminal) {
      p.appendChild(el('div', { class: `banner ${v.terminal.winner === 'US' ? 'us' : 'iran'}` },
        `${v.terminal.winner} WINS — ${v.terminal.reason.replace(/_/g, ' ')}`));
    }

    // Status / prompt line
    if (this.sel.msg) p.appendChild(el('div', { class: 'prompt' }, this.sel.msg));

    // Controls
    if (!v.terminal) {
      if (v.phase === 'iran_setup' && v.viewer === 'IRAN') {
        p.appendChild(this.placementControls());
        p.appendChild(button('End Setup ▶', 'primary', () => this.onIntent({ type: 'END_SETUP' })));
      } else if (v.phase === 'playing' && myTurn) {
        if (v.viewer === 'IRAN') p.appendChild(this.placementControls(true));
        p.appendChild(this.handControls());
        p.appendChild(button('End Turn ▶', 'primary', () =>
          this.onIntent({ type: 'END_TURN', side: v.viewer })));
      } else if (!myTurn) {
        p.appendChild(el('div', { class: 'prompt' }, 'Waiting for the other side…'));
      }
    }

    // Hand list (always show own hand)
    p.appendChild(this.handList());

    // Log (filtered by projection already)
    const log = el('div', { class: 'log' });
    log.appendChild(el('h3', {}, 'Log'));
    const list = el('div', { class: 'log-entries' });
    for (const e of v.log.slice(-40).reverse()) {
      list.appendChild(el('div', { class: 'log-entry' }, `[T${e.turn}] ${e.msg}`));
    }
    log.appendChild(list);
    p.appendChild(log);

    this.panelEl.replaceChildren(p);
  }

  placementControls(compact) {
    const wrap = el('div', { class: 'placement' });
    wrap.appendChild(el('h3', {}, compact ? 'Place (budget permitting)' : 'Place hidden assets'));
    for (const t of ['mine', 'ambush', 'sensor']) {
      const b = button(`${ASSET_GLYPH[t]} ${t}${this.sel.placeType === t ? ' ✓' : ''}`,
        this.sel.placeType === t ? 'active' : '', () => {
          this.sel.placeType = this.sel.placeType === t ? null : t;
          this.sel.cardId = null;
          this.flash(this.sel.placeType
            ? `Placing ${t}: click a ${t === 'mine' ? 'node or lane' : 'node'}.`
            : '');
        });
      wrap.appendChild(b);
    }
    return wrap;
  }

  handControls() {
    const wrap = el('div', { class: 'hand-controls' });
    wrap.appendChild(el('h3', {}, 'Play a card'));
    const hand = this.view.hands[this.view.viewer] || [];
    if (!hand.length) wrap.appendChild(el('div', { class: 'muted' }, '(no cards)'));
    for (const cardId of hand) {
      const card = CARD_META[cardId] || { name: cardId, text: '', target: 'none' };
      const b = button(`${card.name}${this.sel.cardId === cardId ? ' ✓' : ''}`,
        this.sel.cardId === cardId ? 'active' : '', () => this.onCardClick(cardId, card));
      b.title = card.text;
      wrap.appendChild(b);
    }
    return wrap;
  }

  handList() {
    const wrap = el('div', { class: 'hand-list' });
    wrap.appendChild(el('h3', {}, `Your hand (${this.view.viewer})`));
    const hand = this.view.hands[this.view.viewer] || [];
    for (const cardId of hand) {
      const card = CARD_META[cardId] || { name: cardId, text: '' };
      const c = el('div', { class: 'card' });
      c.appendChild(el('div', { class: 'card-name' }, card.name));
      c.appendChild(el('div', { class: 'card-text' }, card.text));
      wrap.appendChild(c);
    }
    const oppCount = this.view.hands[OPP[this.view.viewer]]?.count ?? 0;
    wrap.appendChild(el('div', { class: 'muted' }, `Opponent holds ${oppCount} card(s).`));
    return wrap;
  }

  // ---- interaction handlers ----
  onCardClick(cardId, card) {
    this.sel.placeType = null;
    if (card.target === 'none') {
      this.onIntent({ type: 'PLAY_CARD', side: this.view.viewer, cardId, params: {} });
      this.sel.cardId = null;
      return;
    }
    this.sel.cardId = this.sel.cardId === cardId ? null : cardId;
    const prompt = {
      ownShip: 'Select one of your ships.',
      node: 'Select a node.',
      ownAsset: 'Select one of your hidden assets.',
    }[card.target] || '';
    this.flash(this.sel.cardId ? `${card.name}: ${prompt}` : '');
  }

  onShipClick(shipId) {
    const v = this.view;
    // Card targeting a ship?
    if (this.sel.cardId) {
      const card = CARD_META[this.sel.cardId];
      if (card?.target === 'ownShip') {
        this.onIntent({ type: 'PLAY_CARD', side: v.viewer, cardId: this.sel.cardId, params: { shipId } });
        this.sel.cardId = null; this.sel.msg = '';
        return;
      }
    }
    // Otherwise select the ship for movement (US, own turn).
    if (v.phase === 'playing' && v.viewer === 'US' && v.turn.activeSide === 'US') {
      this.sel.shipId = this.sel.shipId === shipId ? null : shipId;
      this.flash(this.sel.shipId ? `${shipId} selected — click an adjacent node to move.` : '');
      this.renderBoard();
    }
  }

  onNodeClick(nodeId) {
    const v = this.view;
    // Placement (Iran)
    if (this.sel.placeType) {
      this.onIntent({ type: 'PLACE_ASSET', side: 'IRAN', assetType: this.sel.placeType, location: { kind: 'node', ref: nodeId } });
      return;
    }
    // Card targeting a node
    if (this.sel.cardId) {
      const card = CARD_META[this.sel.cardId];
      if (card?.target === 'node') {
        this.onIntent({ type: 'PLAY_CARD', side: v.viewer, cardId: this.sel.cardId, params: { node: nodeId } });
        this.sel.cardId = null; this.sel.msg = '';
        return;
      }
    }
    // Movement (US)
    if (this.sel.shipId) {
      this.onIntent({ type: 'MOVE_SHIP', side: 'US', shipId: this.sel.shipId, toNode: nodeId });
    }
  }

  onEdgeClick(key) {
    if (this.sel.placeType === 'mine') {
      this.onIntent({ type: 'PLACE_ASSET', side: 'IRAN', assetType: 'mine', location: { kind: 'edge', ref: key } });
    }
  }

  onAssetClick(assetId) {
    if (this.sel.cardId) {
      const card = CARD_META[this.sel.cardId];
      if (card?.target === 'ownAsset') {
        this.onIntent({ type: 'PLAY_CARD', side: this.view.viewer, cardId: this.sel.cardId, params: { assetId } });
        this.sel.cardId = null; this.sel.msg = '';
      }
    }
  }

  // ---- clickability predicates ----
  canPlaceOnEdge() {
    const v = this.view;
    return this.sel.placeType === 'mine' &&
      ((v.phase === 'iran_setup' && v.viewer === 'IRAN') ||
       (v.phase === 'playing' && v.viewer === 'IRAN' && v.turn.activeSide === 'IRAN'));
  }

  canTargetOwnAsset() {
    return this.view.viewer === 'IRAN' && this.sel.cardId &&
      CARD_META[this.sel.cardId]?.target === 'ownAsset';
  }

  isNodeClickable(node) {
    const v = this.view;
    if (this.sel.placeType && v.viewer === 'IRAN') {
      // node placement only on placement-eligible nodes
      return !!node.placementEligible;
    }
    if (this.sel.cardId && CARD_META[this.sel.cardId]?.target === 'node') return true;
    if (this.sel.shipId && v.viewer === 'US') return true;
    return false;
  }
}

// Card metadata for display, injected from the catalog at load (see main.js).
export const CARD_META = {};
export function registerCardMeta(catalog) {
  for (const c of catalog) CARD_META[c.id] = { name: c.name, text: c.text, target: c.target, deck: c.deck };
}

const OPP = { US: 'IRAN', IRAN: 'US' };

// ---- tiny DOM/SVG helpers ----
function el(tag, attrs = {}, textContent) {
  const isSvg = ['svg', 'line', 'circle', 'rect', 'g', 'text', 'path'].includes(tag);
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, val] of Object.entries(attrs)) {
    if (k === 'class') node.setAttribute('class', val);
    else node.setAttribute(k, val);
  }
  if (textContent != null) node.textContent = textContent;
  return node;
}
function text(x, y, content, attrs = {}) {
  return el('text', { x, y, ...attrs }, content);
}
function button(label, cls, onClick) {
  const b = el('button', { class: `btn ${cls || ''}` }, label);
  b.addEventListener('click', onClick);
  return b;
}
function kv(k, v) {
  const d = el('div', { class: 'kv' });
  d.appendChild(el('span', { class: 'k' }, k));
  d.appendChild(el('span', { class: 'v' }, v));
  return d;
}
function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
