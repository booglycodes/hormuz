// network.js — Trystero networking, game state machine, NetworkControl

const TRYSTERO_APP_ID = "supermashbruddas-phone"

// === GAME PHASES ===
const PHASE_LOBBY = "lobby"
const PHASE_SELECT = "select"
const PHASE_PLAYING = "playing"
const PHASE_GAMEOVER = "gameover"

let gamePhase = PHASE_LOBBY
let connectedPeers = [] // { peerId, selectedChar, locked }
let winnerName = null
let gameoverTimer = 0
const GAMEOVER_DURATION = 4000 // ms before auto-restart

// === CHARACTER DATA ===
let character_names_list = ['trump', 'stoner', 'faceman', 'knigh', 'utopian', 'shrek', 'monke']

// Button mapping per character
const CHARACTER_MAPPINGS = {
  trump: {
    b0: 0, b1: 1, b2: 1, b3: 2, b4: 3,
    numAbilities: 4,
    labels: { up: "BIGLY PUNCH", left: "THROW ORANGE", right: "THROW ORANGE", down: "BUILD WALL", hold: "RED STATE" }
  },
  stoner: {
    b0: 2, b1: 0, b2: 3, b3: 1, b4: 4,
    numAbilities: 5,
    labels: { up: "HIGH LIFE", left: "DRUGS", right: "FREE WEED", down: "BIGBONGO", hold: "POT BROWNIE" }
  },
  faceman: {
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
    b0: 3, b1: 1, b2: 2, b3: 0, b4: 4,
    numAbilities: 5,
    labels: { up: "LIGHTNING", left: "FIRE", right: "ICE", down: "HONOUR SLASH", hold: "PHYSICS HW" }
  },
  utopian: {
    b0: 3, b1: 1, b2: 2, b3: 0, b4: 4,
    numAbilities: 5,
    labels: { up: "TURRET", left: "GENERATOR", right: "DRONES", down: "SHOCK", hold: "TELEPORT" }
  },
  shrek: {
    b0: 2, b1: 3, b2: 4, b3: 0, b4: 1,
    numAbilities: 5,
    labels: { up: "GRAB", left: "SHREKSTITUTION ←", right: "SHREKSTITUTION →", down: "SHREKDOWN", hold: "DONKEY" }
  },
  monke: {
    b0: 0, b1: 0, b2: 0, b3: 0, b4: -1,
    numAbilities: 1,
    labels: { up: "GRAB", left: "GRAB", right: "GRAB", down: "GRAB", hold: "" }
  }
}

// === NETWORK CONTROL ===
class NetworkControl {
  constructor(characterName) {
    this._axes = new Vector2(0, 0)
    this._jump = false
    this._rawButtons = [false, false, false, false, false]
    this.characterName = characterName || 'trump'
    this.mapping = CHARACTER_MAPPINGS[this.characterName] || CHARACTER_MAPPINGS.trump
  }

  setCharacter(name) {
    this.characterName = name
    this.mapping = CHARACTER_MAPPINGS[name] || CHARACTER_MAPPINGS.trump
  }

  updateInput(data) {
    this._axes = new Vector2(data.dx || 0, data.dy || 0)
    this._jump = !!data.jump
    this._rawButtons = [!!data.b0, !!data.b1, !!data.b2, !!data.b3, !!data.b4]
  }

  axes() { return this._axes }
  jump() { return this._jump }

  buttons() {
    const out = new Array(this.mapping.numAbilities).fill(false)
    for (let i = 0; i < 5; i++) {
      if (this._rawButtons[i] && this.mapping[`b${i}`] >= 0) {
        out[this.mapping[`b${i}`]] = true
      }
    }
    return out
  }
}

// === ROOM MANAGEMENT ===
let room = null
let sendPhase = null
let sendCharInfo = null
let sendCharList = null
let receiveInput = null
let receiveSelect = null
const networkControls = new Map()

function getQRUrl(roomName) {
  const base = window.location.href.replace(/\/[^/]*$/, '/')
  return `${base}controller.html?room=${encodeURIComponent(roomName)}`
}

async function initNetwork() {
  const { joinRoom } = await import("https://esm.run/trystero@0.22.0")

  const roomName = Math.random().toString(36).slice(2, 12)
  room = joinRoom({ appId: TRYSTERO_APP_ID }, roomName)

  const [_sendInput, _receiveInput] = room.makeAction("input")
  const [_sendPhase, _receivePhase] = room.makeAction("phase")
  const [_sendCharInfo, _receiveCharInfo] = room.makeAction("charinfo")
  const [_sendCharList, _receiveCharList] = room.makeAction("charlist")
  const [_sendSelect, _receiveSelect] = room.makeAction("select")

  sendPhase = _sendPhase
  sendCharInfo = _sendCharInfo
  sendCharList = _sendCharList
  receiveInput = _receiveInput
  receiveSelect = _receiveSelect

  _receivePhase(() => {})
  _receiveCharInfo(() => {})
  _receiveCharList(() => {})

  receiveInput((data, peerId) => {
    if (gamePhase !== PHASE_PLAYING) return
    const ctrl = networkControls.get(peerId)
    if (ctrl) ctrl.updateInput(data)
  })

  _receiveSelect((data, peerId) => {
    if (gamePhase !== PHASE_SELECT) return
    const peer = connectedPeers.find(p => p.peerId === peerId)
    if (!peer) return

    if (data.type === "browse") {
      peer.selectedChar = data.char
    } else if (data.type === "lock") {
      peer.locked = true
      peer.selectedChar = data.char
      checkAllLocked()
    }
  })

  room.onPeerJoin(peerId => {
    console.log("[network] peer joined:", peerId)
    const ctrl = new NetworkControl()
    networkControls.set(peerId, ctrl)
    connectedPeers.push({ peerId, selectedChar: character_names_list[0], locked: false })

    // Send current phase and character list to new peer
    sendPhase({ phase: gamePhase }, peerId)
    sendCharList({ characters: character_names_list }, peerId)
  })

  room.onPeerLeave(peerId => {
    console.log("[network] peer left:", peerId)
    networkControls.delete(peerId)
    connectedPeers = connectedPeers.filter(p => p.peerId !== peerId)
  })

  return roomName
}

// === PHASE TRANSITIONS ===
function transitionTo(phase) {
  gamePhase = phase
  sendPhase({ phase })

  if (phase === PHASE_SELECT) {
    // Reset selections
    for (const p of connectedPeers) {
      p.locked = false
      p.selectedChar = character_names_list[0]
    }
    sendCharList({ characters: character_names_list })
  }
}

function checkAllLocked() {
  if (connectedPeers.length < 1) return
  if (connectedPeers.every(p => p.locked)) {
    startGame()
  }
}

function startGame() {
  // Assign characters to controls
  for (const peer of connectedPeers) {
    const ctrl = networkControls.get(peer.peerId)
    if (ctrl) {
      ctrl.setCharacter(peer.selectedChar)
      // Send labels to phone
      const mapping = CHARACTER_MAPPINGS[peer.selectedChar] || CHARACTER_MAPPINGS.trump
      sendCharInfo({ labels: mapping.labels, phase: PHASE_PLAYING }, peer.peerId)
    }
  }

  transitionTo(PHASE_PLAYING)
  initGame() // defined in game.js
}

function onGameOver(winner) {
  winnerName = winner
  transitionTo(PHASE_GAMEOVER)
  gameoverTimer = performance.now()
}

function checkGameoverTimeout() {
  if (gamePhase === PHASE_GAMEOVER && performance.now() - gameoverTimer > GAMEOVER_DURATION) {
    transitionTo(PHASE_SELECT)
  }
}

// Called from index.html after lobby
function startSelectPhase() {
  if (connectedPeers.length > 0) {
    transitionTo(PHASE_SELECT)
  }
}
