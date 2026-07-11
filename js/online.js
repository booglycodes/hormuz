// online.js — host-authoritative P2P adapter over Trystero (serverless WebRTC).
//
// One peer is the HOST: it holds the authoritative game state and runs the
// engine. The other peer is a thin CLIENT: it sends action requests and renders
// only the filtered view the host sends back. Opponent hidden state is never
// serialized to a peer — the host projects each side's view before sending, so
// concealment is enforced by the same projectView() used in hot-seat.
//
// Trust model (v1): trust-based. The host is trusted; the client cannot cheat
// because the host resolves everything. No cryptographic anti-cheat (deferred).
//
// Requires network access to load Trystero from a CDN and to reach the Nostr
// signaling relays for peer discovery. After connection, all game data is sent
// directly peer-to-peer and end-to-end encrypted.

import { applyAction } from './engine.js';
import { projectView } from './view.js';

// Single swap-point for the Trystero strategy. Default export = Nostr strategy.
const TRYSTERO_URL = 'https://esm.sh/trystero';
const APP_ID = 'hormuz-strait-game-v1';
const OPP = { US: 'IRAN', IRAN: 'US' };

export class OnlineController {
  /**
   * @param {object} opts
   * @param {import('./ui.js').GameUI} opts.ui
   * @param {HTMLElement} opts.statusEl connection-status element
   */
  constructor({ ui, statusEl }) {
    this.ui = ui;
    this.statusEl = statusEl;
    this.room = null;
    this.role = null;      // 'host' | 'client'
    this.state = null;     // host only
    this.mySide = null;
    this.peerId = null;
    this.act = null;       // action channel
    this.viewCh = null;    // view channel
  }

  status(msg, cls = '') {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
      this.statusEl.className = `status ${cls}`;
    }
  }

  async #joinRoom(roomId, password) {
    const { joinRoom, selfId } = await import(/* @vite-ignore */ TRYSTERO_URL);
    this.selfId = selfId;
    const config = { appId: APP_ID };
    if (password) config.password = password;
    this.room = joinRoom(config, roomId);
    this.act = this.room.makeAction('act');
    this.viewCh = this.room.makeAction('view');
  }

  /**
   * Host a game: create the room, hold authoritative state, control `hostSide`.
   * @param {{roomId:string, password?:string, hostSide:'US'|'IRAN', state:object}} o
   */
  async host({ roomId, password, hostSide, state }) {
    this.role = 'host';
    this.hostSide = hostSide;
    this.clientSide = OPP[hostSide];
    this.mySide = hostSide;
    this.state = state;

    await this.#joinRoom(roomId, password);
    this.status('Waiting for opponent to join…', 'waiting');

    // Client action requests → apply on the authoritative engine.
    this.act.onMessage = (msg /*, meta */) => {
      const action = msg?.action;
      if (!action) return;
      // Enforce that side-bearing actions match the client's assigned side.
      if (action.side && action.side !== this.clientSide) return;
      this.#applyAndBroadcast(action);
    };

    this.room.onPeerJoin = (peerId) => {
      this.peerId = peerId;
      this.status('Opponent connected.', 'connected');
      this.#sendView(); // push initial state to the client
      this.#renderHost();
    };
    this.room.onPeerLeave = () => {
      this.peerId = null;
      this.status('Opponent disconnected. Match paused.', 'error');
    };

    // Host's own intents apply directly to the authoritative state.
    this.ui.onIntent = (action) => this.#applyAndBroadcast(action);

    this.#renderHost();
  }

  /**
   * Join a game as the thin client.
   * @param {{roomId:string, password?:string}} o
   */
  async join({ roomId, password }) {
    this.role = 'client';
    await this.#joinRoom(roomId, password);
    this.status('Connecting to host…', 'waiting');

    // Host pushes our projected view.
    this.viewCh.onMessage = (msg) => {
      if (!msg?.view) return;
      this.mySide = msg.yourSide;
      this.status(`Connected as ${this.mySide}.`, 'connected');
      this.ui.setView(msg.view);
    };

    this.room.onPeerJoin = () => this.status('Connected to host.', 'connected');
    this.room.onPeerLeave = () => this.status('Host disconnected. Match ended.', 'error');

    // Client intents are requests; nothing is applied locally.
    this.ui.onIntent = (action) => {
      this.act.send({ action });
    };
  }

  // ---- host internals ----
  #applyAndBroadcast(action) {
    const res = applyAction(this.state, action);
    if (!res.ok) {
      // Only surface errors for the host's own actions locally.
      this.ui.flash(`⚠ ${res.error}`);
      return;
    }
    this.state = res.state;
    this.#renderHost();
    this.#sendView();
  }

  #renderHost() {
    this.ui.setView(projectView(this.state, this.hostSide));
  }

  #sendView() {
    if (!this.viewCh) return;
    const payload = { view: projectView(this.state, this.clientSide), yourSide: this.clientSide };
    // Send to all peers (only the client is present).
    this.viewCh.send(payload);
  }

  leave() {
    try { this.room?.leave(); } catch (_) { /* noop */ }
  }
}
