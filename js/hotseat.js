// hotseat.js — local pass-and-play controller (host-authoritative on one device).
//
// Holds the authoritative game state, applies action intents through the engine,
// and renders the *currently shown* side's projected view. Because both players
// share one screen, a Swap-Sides interstitial gates the transition so the next
// side's hidden information is never revealed to the wrong player.

import { applyAction, SIDES } from './engine.js';
import { projectView } from './view.js';

const OPP = { US: 'IRAN', IRAN: 'US' };

export class HotseatController {
  /**
   * @param {object} opts
   * @param {import('./ui.js').GameUI} opts.ui
   * @param {HTMLElement} opts.overlay full-screen interstitial element
   * @param {object} opts.state initial engine state (from initGame)
   */
  constructor({ ui, overlay, state }) {
    this.ui = ui;
    this.overlay = overlay;
    this.state = state;
    this.shownSide = state.turn.activeSide; // IRAN during setup
    this.ui.onIntent = (action) => this.handleIntent(action);
  }

  start() {
    this.hideOverlay();
    this.renderCurrent();
  }

  renderCurrent() {
    this.ui.setView(projectView(this.state, this.shownSide));
  }

  handleIntent(action) {
    // Only the shown side may act, and only on its turn (engine also enforces this).
    const res = applyAction(this.state, action);
    if (!res.ok) {
      this.ui.flash(`⚠ ${res.error}`);
      return;
    }
    this.state = res.state;

    if (this.state.terminal) {
      this.renderCurrent();
      return;
    }

    // If control has passed to the other side, gate with the swap interstitial.
    const active = this.state.turn.activeSide;
    if (active !== this.shownSide) {
      this.promptSwap(active);
    } else {
      this.renderCurrent();
    }
  }

  /** Explicit "Swap Sides" request (hand the device to the other player). */
  requestSwap() {
    this.promptSwap(OPP[this.shownSide]);
  }

  promptSwap(toSide) {
    const label = toSide === SIDES.US ? 'United States' : 'Iran';
    this.overlay.replaceChildren();
    const box = document.createElement('div');
    box.className = 'swap-box';
    const h = document.createElement('h1');
    h.textContent = 'Pass the device';
    const p = document.createElement('p');
    p.textContent = `Hand the device to the ${label} player. Their hidden information will only be shown after they confirm.`;
    const btn = document.createElement('button');
    btn.className = 'btn primary big';
    btn.textContent = `I am ${label} — show my turn`;
    btn.addEventListener('click', () => {
      this.shownSide = toSide;
      this.hideOverlay();
      this.renderCurrent();
    });
    box.append(h, p, btn);
    this.overlay.appendChild(box);
    this.overlay.classList.add('visible');
  }

  hideOverlay() {
    this.overlay.classList.remove('visible');
    this.overlay.replaceChildren();
  }
}
