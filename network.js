// network.js — Trystero networking + NetworkControl class
// Loaded as ES module in index.html, exposes globals for game.js

const TRYSTERO_APP_ID = "supermashbruddas-phone"

// NetworkControl mimics the Control interface from player.js
// It receives input state from a connected phone
class NetworkControl {
  constructor() {
    this._axes = new Vector2(0, 0)
    this._jump = false
    this._buttons = [false, false, false, false, false]
  }

  // Called by network layer when input arrives from phone
  updateInput(data) {
    this._axes = new Vector2(data.dx || 0, data.dy || 0)
    this._jump = !!data.jump
    this._buttons = [
      !!data.b0,
      !!data.b1,
      !!data.b2,
      !!data.b3,
      !!data.b4
    ]
  }

  axes() {
    return this._axes
  }

  jump() {
    return this._jump
  }

  buttons() {
    return this._buttons
  }
}

// Room management
let room = null
let sendState = null
let receiveInput = null
const networkControls = new Map() // peerId -> NetworkControl
const peerOrder = [] // track join order for spawn positions

function getQRUrl(roomName) {
  return `${window.location.origin}${window.location.pathname}controller.html?room=${encodeURIComponent(roomName)}`
}

async function hostGame(onPlayerJoin, onPlayerLeave) {
  // Dynamic import of Trystero
  const { joinRoom } = await import("https://esm.run/trystero@0.22.0")

  const roomName = Math.random().toString(36).slice(2, 12)

  room = joinRoom({ appId: TRYSTERO_APP_ID }, roomName)

  const [_sendInput, _receiveInput] = room.makeAction("input")
  receiveInput = _receiveInput

  receiveInput((data, peerId) => {
    const ctrl = networkControls.get(peerId)
    if (ctrl) {
      ctrl.updateInput(data)
    }
  })

  room.onPeerJoin(peerId => {
    console.log("[network] peer joined:", peerId)
    const ctrl = new NetworkControl()
    networkControls.set(peerId, ctrl)
    peerOrder.push(peerId)
    if (onPlayerJoin) onPlayerJoin(peerId, ctrl)
  })

  room.onPeerLeave(peerId => {
    console.log("[network] peer left:", peerId)
    networkControls.delete(peerId)
    const idx = peerOrder.indexOf(peerId)
    if (idx >= 0) peerOrder.splice(idx, 1)
    if (onPlayerLeave) onPlayerLeave(peerId)
  })

  return roomName
}
