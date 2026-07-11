// menu.js — main menu. Hosting/joining navigates to game.html with the room in the URL.

function randomRoom() {
  return 'HORMUZ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function go(params) {
  location.href = 'game.html?' + new URLSearchParams(params).toString();
}

const statusEl = document.getElementById('menu-status');

document.getElementById('btn-host').addEventListener('click', () => {
  const side = document.getElementById('host-side').value;
  go({ mode: 'host', side, room: randomRoom() });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const room = (document.getElementById('room-code').value || '').trim();
  if (!room) {
    statusEl.textContent = 'Enter the room code your opponent shared.';
    statusEl.className = 'status error';
    return;
  }
  go({ mode: 'join', room });
});

// Allow Enter in the room-code field to join.
document.getElementById('room-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});
