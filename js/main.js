// main.js — bootstrap, menu/mode selection, and wiring.

import { initGame } from './engine.js';
import { GameUI, registerCardMeta } from './ui.js';
import { CARD_CATALOG } from './cards.js';
import { HotseatController } from './hotseat.js';
import { OnlineController } from './online.js';

const els = {
  menu: document.getElementById('menu'),
  game: document.getElementById('game'),
  board: document.getElementById('board'),
  panel: document.getElementById('panel'),
  overlay: document.getElementById('overlay'),
  modeControls: document.getElementById('mode-controls'),
  status: document.getElementById('online-status'),
};

let content = { board: null, config: null };
let activeController = null;

async function loadContent() {
  const [board, config] = await Promise.all([
    fetch('content/board.json').then((r) => r.json()),
    fetch('content/config.json').then((r) => r.json()),
  ]);
  content = { board, config };
  registerCardMeta(CARD_CATALOG);
}

function showGame() {
  els.menu.hidden = true;
  els.game.hidden = false;
}

function backToMenuButton() {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = '⟵ Menu';
  b.addEventListener('click', () => {
    if (activeController?.leave) activeController.leave();
    activeController = null;
    els.overlay.classList.remove('visible');
    els.overlay.replaceChildren();
    els.game.hidden = true;
    els.menu.hidden = false;
    els.modeControls.replaceChildren();
  });
  return b;
}

function newUI() {
  return new GameUI({ board: els.board, panel: els.panel }, () => {});
}

// ---- Hot-seat ----
function startHotseat() {
  const ui = newUI();
  const state = initGame(content.board, content.config, content.config.seed);
  const controller = new HotseatController({ ui, overlay: els.overlay, state });
  activeController = controller;

  els.modeControls.replaceChildren();
  const swapBtn = document.createElement('button');
  swapBtn.className = 'btn';
  swapBtn.textContent = '⇄ Swap Sides';
  swapBtn.addEventListener('click', () => controller.requestSwap());
  els.modeControls.append(swapBtn, backToMenuButton());

  showGame();
  controller.start();
}

// ---- Online ----
async function startOnline(mode) {
  const roomInput = document.getElementById('room-code');
  let roomId = (roomInput.value || '').trim();
  if (!roomId) {
    roomId = 'HORMUZ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    roomInput.value = roomId;
  }
  const hostSide = document.getElementById('host-side').value;

  const ui = newUI();
  const controller = new OnlineController({ ui, statusEl: els.status });
  activeController = controller;

  try {
    if (mode === 'host') {
      const state = initGame(content.board, content.config, content.config.seed);
      await controller.host({ roomId, hostSide, state });
    } else {
      await controller.join({ roomId });
    }
  } catch (e) {
    controller.status(`Failed to connect: ${e.message}`, 'error');
    return;
  }

  els.modeControls.replaceChildren();
  const codeTag = document.createElement('span');
  codeTag.className = 'tagline';
  codeTag.textContent = `Room: ${roomId}`;
  els.modeControls.append(codeTag, backToMenuButton());
  showGame();
}

function wireMenu() {
  document.getElementById('btn-hotseat').addEventListener('click', startHotseat);
  document.getElementById('btn-host').addEventListener('click', () => startOnline('host'));
  document.getElementById('btn-join').addEventListener('click', () => startOnline('join'));
}

loadContent()
  .then(wireMenu)
  .catch((e) => {
    els.menu.innerHTML = `<div class="menu-card"><h2>Failed to load</h2><p class="blurb">${e.message}. Run a local web server (see README) — opening the file directly won't work with ES modules.</p></div>`;
  });
