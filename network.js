// network.js — Trystero networking + NetworkControl class

const TRYSTERO_APP_ID = "supermashbruddas-phone"

// Button mapping per character
// Maps gesture inputs (b0=up, b1=left, b2=right, b3=down, b4=hold)
// to ability indices in the character's ability array
const CHARACTER_MAPPINGS = {
  trump: {
    // swipe up -> bigly punch (0), left/right -> throw orange (1), down -> build wall (2), hold -> red state (3)
    b0: 0, b1: 1, b2: 1, b3: 2, b4: 3,
    numAbilities: 4,
    labels: { up: "BIGLY PUNCH", left: "THROW ORANGE", right: "THROW ORANGE", down: "BUILD WALL", hold: "RED STATE" }
  },
  stoner: {
    // up -> drugs (0), left -> bigBongo (1), right -> high life (2), down -> free weed zone (3), hold -> pot brownie (4)
    b0: 0, b1: 1, b2: 2, b3: 3, b4: 4,
    numAbilities: 5,
    labels: { up: "DRUGS", left: "BIGBONGO", right: "HIGH LIFE", down: "FREE WEED", hold: "POT BROWNIE" }
  },
  faceman: {
    // up -> eat (0), left/right -> rushdown (1), down -> belch (2)
    b0: 0, b1: 1, b2: 1, b3: 2, b4: -1,
    numAbilities: 3,
    labels: { up: "EAT", left: "RUSHDOWN", right: "RUSHDOWN", down: "BELCH", hold: "" }
  },
  faceman_shaman: {
    b0: 0, b1: 1, b2: 1, b3: 2, b4: -1,
    numAbilities: 3,
    labels: { up: "EAT", left: "RUSHDOWN", right: "RUSHDOWN", down: "BELCH", hold: "" }
  },
  knigh: {
    // up -> honour slash (0), left -> fire (1), right -> ice (2), down -> lightning (3), hold -> physics homework (4)
    b0: 0, b1: 1, b2: 2, b3: 3, b4: 4,
    numAbilities: 5,
    labels: { up: "HONOUR SLASH", left: "FIRE", right: "ICE", down: "LIGHTNING", hold: "PHYSICS HW" }
  },
  utopian: {
    // up -> shock (0), left -> generator (1), right -> drones (2), down -> turret (3), hold -> teleport (4)
    b0: 0, b1: 1, b2: 2, b3: 3, b4: 4,
    numAbilities: 5,
    labels: { up: "SHOCK", left: "GENERATOR", right: "DRONES", down: "TURRET", hold: "TELEPORT" }
  },
  shrek: {
    // up -> shrekgrab (0), left -> shrekdown (1), right -> donkey (2), down -> shrekstitution (3)
    b0: 0, b1: 1, b2: 2, b3: 3, b4: -1,
    numAbilities: 4,
    labels: { up: "GRAB", left: "SHREKDOWN", right: "DONKEY", down: "SHREKSTITUTION", hold: "" }
  },
  monke: {
    // up -> grab (0)
    b0: 0, b1: 0, b2: 0, b3: 0, b4: -1,
    numAbilities: 1,
    labels: { up: "GRAB", left: "GRAB", right: "GRAB", down: "GRAB", hold: "" }
  }
}

// NetworkControl mimics the Control interface from player.js
class NetworkControl {
  constructor(characterName) {
    this._axes = new Vector2(0, 0)
    this._jump = false
    this._rawButtons = [false, false, false, false, false]
    this.characterName = characterName || 'trump'
    this.mapping = CHARACTER_MAPPINGS[this.characterName] || CHARACTER_MAPPINGS.trump
  }

  updateInput(data) {
    this._axes = new Vector2(data.dx || 0, data.dy || 0)
    this._jump = !!data.jump
    this._rawButtons = [!!data.b0, !!data.b1, !!data.b2, !!data.b3, !!data.b4]
  }

  axes() {
    return this._axes
  }

  jump() {
    return this._jump
  }

  buttons() {
    // Remap raw gesture buttons to ability slot positions
    const out = new Array(this.mapping.numAbilities).fill(false)
    for (let i = 0; i < 5; i++) {
      if (this._rawButtons[i] && this.mapping[`b${i}`] >= 0) {
        out[this.mapping[`b${i}`]] = true
      }
    }
    return out
  }
}

// Room management
let room = null
let sendState = null
let sendCharInfo = null
let receiveInput = null
const networkControls = new Map()
const peerOrder = []

function getQRUrl(roomName) {
  return `${window.location.origin}${window.location.pathname}controller.html?room=${encodeURIComponent(roomName)}`
}

async function hostGame(onPlayerJoin, onPlayerLeave) {
  const { joinRoom } = await import("https://esm.run/trystero@0.22.0")

  const roomName = Math.random().toString(36).slice(2, 12)

  room = joinRoom({ appId: TRYSTERO_APP_ID }, roomName)

  const [_sendInput, _receiveInput] = room.makeAction("input")
  const [_sendCharInfo, _receiveCharInfo] = room.makeAction("charinfo")
  receiveInput = _receiveInput
  sendCharInfo = _sendCharInfo
  _receiveCharInfo(() => {})

  receiveInput((data, peerId) => {
    const ctrl = networkControls.get(peerId)
    if (ctrl) {
      ctrl.updateInput(data)
    }
  })

  room.onPeerJoin(peerId => {
    console.log("[network] peer joined:", peerId)
    const ctrl = new NetworkControl() // character assigned later
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

// Called after a player is assigned a character to send labels to their phone
function sendCharacterInfo(peerId, characterName) {
  const ctrl = networkControls.get(peerId)
  if (ctrl) {
    ctrl.characterName = characterName
    ctrl.mapping = CHARACTER_MAPPINGS[characterName] || CHARACTER_MAPPINGS.trump
  }
  if (sendCharInfo) {
    const mapping = CHARACTER_MAPPINGS[characterName] || CHARACTER_MAPPINGS.trump
    sendCharInfo(mapping.labels, peerId)
  }
}
