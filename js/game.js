// game.js — game page. Reads mode/side/room from the URL and starts an online session.

import { initGame } from './engine.js';
import { GameUI, registerCardMeta } from './ui.js';
import { CARD_CATALOG } from './cards.js';
import { OnlineController } from './online.js';

const els = {
  board: document.getElementById('board'),
  panel: document.getElementById('panel'),
  status: document.getElementById('status'),
  roomTag: document.getElementById('room-tag'),
  leave: document.querySelector('#mode-controls a'),
};

const params = new URLSearchParams(location.search);
const mode = params.get('mode');          // 'host' | 'join'
const room = params.get('room');
const side = params.get('side');          // host only: 'US' | 'IRAN'

function fatal(msg) {
  els.status.textContent = msg;
  els.status.className = 'status error';
  els.panel.innerHTML = `<div class="menu-card"><p class="blurb">${msg}</p><a class="btn primary" href="index.html">Back to menu</a></div>`;
}

async function loadContent() {
  const [board, config] = await Promise.all([
    fetch('content/board.json').then((r) => r.json()),
    fetch('content/config.json').then((r) => r.json()),
  ]);
  registerCardMeta(CARD_CATALOG);
  return { board, config };
}

async function main() {
  if (!room || (mode !== 'host' && mode !== 'join')) {
    fatal('Missing or invalid game link. Return to the menu to host or join a game.');
    return;
  }

  const ui = new GameUI({ board: els.board, panel: els.panel }, () => {});
  const controller = new OnlineController({ ui, statusEl: els.status });

  // Ensure we leave the room cleanly when navigating away.
  els.leave.addEventListener('click', () => controller.leave());
  window.addEventListener('beforeunload', () => controller.leave());

  let content;
  try {
    content = await loadContent();
  } catch (e) {
    fatal(`Failed to load game content: ${e.message}. Serve over http:// (not file://).`);
    return;
  }

  try {
    if (mode === 'host') {
      els.roomTag.textContent = `Room ${room} — share this code`;
      const state = initGame(content.board, content.config, content.config.seed);
      await controller.host({ roomId: room, hostSide: side || 'US', state });
    } else {
      els.roomTag.textContent = `Room ${room}`;
      await controller.join({ roomId: room });
    }
  } catch (e) {
    fatal(`Failed to connect: ${e.message}`);
  }
}

main();
