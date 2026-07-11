# ⚓ Hormuz — Strait Runner

An asymmetric two-player strategy board game set in the Strait of Hormuz, built as a
zero-backend static web app in **vanilla JavaScript + HTML** (native ES modules, no bundler).

- **United States** — the visible, stronger side. Runs a **fleet** of oil tankers through the
  strait. Wins by delivering **more than the target amount of oil** before the clock runs out,
  while managing its **popularity** (political capital).
- **Iran** — the hidden, weaker side. Secretly places **mines**, **ambushes**, and **sensors**,
  springing **surprise attacks** when a US ship transits them. Wins by running out the US clock,
  collapsing US popularity, or sinking the whole fleet.

Play **local hot-seat** (one device, with a Swap Sides screen that hides each side's secrets) or
**online peer-to-peer** over WebRTC via [Trystero](https://trystero.dev) — no server required.

---

## Running the game

ES modules must be served over HTTP (opening `index.html` as a `file://` won't work).

```sh
cd app
npm run serve       # → python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (e.g. `npx serve`, `python3 -m http.server`, etc.).

- **Hot-seat:** click *Start hot-seat game*. Pass the device when prompted.
- **Online:** one player clicks *Host new room* (a room code is generated and shown in the header)
  and picks their side; the other enters the same code and clicks *Join room*. Requires internet
  access for Trystero's CDN and Nostr signaling relays. All game data is sent directly
  peer-to-peer and end-to-end encrypted; only peer *discovery* uses the public relays.

## Running the tests

Node is used **only** for the automated tests — it is *not* needed to play the game (that just
needs a static file server and a browser). The engine is pure and headless, tested with Node's
built-in test runner (no dependencies):

```sh
cd app
nvm use             # reads .nvmrc → Node 16.20.2
npm test            # → node --test
```

> **Why pin Node 16?** The project is pinned via `.nvmrc` to Node **16.20.2**. The code itself
> supports modern Node, but on this workstation newer Node binaries (≥18) fail to load with a
> GLIBC error, and Node 17 lacks `node:test`. Node 16.20.2 runs the suite cleanly. `nvm use`
> selects it automatically; if you don't use nvm, run the suite with any Node ≥16.17:
> ```sh
> ~/.nvm/versions/node/v16.20.2/bin/node --test
> ```

Current suite: **4 files / ~28 tests** — RNG determinism, board validation (incl. the chokepoint
invariant), engine rules (movement, mine sink + popularity, oil-target win, clock win, budget
enforcement, view projection), and a full multi-turn playthrough + determinism check.

---

## How to play

1. **Iran setup.** Iran places hidden mines (on nodes or lanes), ambushes, and sensors within its
   placement budget, then clicks **End Setup**. These are invisible to the US player.
2. **US turn.** Click a tanker to select it, then click an adjacent node to move (limited steps per
   turn). Transiting a hidden Iranian asset **reveals and triggers** it — mines and ambushes sink
   the ship. Reaching an **exit** node banks that ship's oil toward the target. Play US ability
   cards. Click **End Turn**.
3. **Iran turn.** Place any remaining assets, play Iran ability cards, then **End Turn**. Ending
   Iran's turn advances the clock.
4. **Winning** (checked in this precedence, exactly one outcome):
   1. `US_OIL_TARGET` — cumulative delivered oil exceeds the target → **US wins**.
   2. `IRAN_POPULARITY` — US popularity hits 0 → **Iran wins**.
   3. `IRAN_CLOCK` — the clock runs out first → **Iran wins**.
   4. `IRAN_ATTRITION` — no US ship can still deliver → **Iran wins**.

   A ship sunk on an exit lane does **not** bank its cargo (sink precedes delivery).

### Ability cards (three decks)

- **Event deck** (shared): drawn each round, changes game state (weather, popularity swings, intel
  leaks, mine drift). Reshuffles when exhausted.
- **US deck** (drawn on the US turn): Go Dark (hide a ship 2 turns), Carrier Air Patrol (reveal
  nearby hidden assets), Minesweeper Escort (clear an adjacent mine), Full Steam Ahead (+movement),
  Convoy Escort (survive next attack), Rally Public Support (+popularity), Emergency Resupply (add
  a tanker), Show of Force (block Iran placement; costs popularity).
- **Iran deck** (drawn on the Iran turn): Fast Attack Swarm, Naval Mine Barrage, Silent Running,
  Decoy Contact, Limpet Mine, Shahed Recon, Coastal Battery, Propaganda Broadcast.

---

## Architecture

One-directional flow: **content → engine → mode → UI**. Only the mode layer touches the network;
the engine never imports DOM or transport code.

| File | Role |
|---|---|
| `js/rng.js` | Seeded deterministic PRNG (mulberry32) — reproducible shuffles/draws. |
| `js/config.js` | Config defaults + validation (rejects unwinnable configs). |
| `js/board.js` | Graph adjacency + validator (enforces the chokepoint invariant). |
| `js/cards.js` | Three-deck ability-card catalog + deterministic effect interpreter. |
| `js/engine.js` | **Pure** rules engine: `initGame`, `applyAction`, `evaluateTerminal`. Never mutates input. |
| `js/view.js` | `projectView(state, side)` — the single concealment mechanism (hides opponent secrets). |
| `js/util.js` | Portable `deepClone`. |
| `js/ui.js` | SVG board renderer + interaction; renders a `PlayerView`, emits action intents. |
| `js/hotseat.js` | Local pass-and-play controller + Swap Sides interstitial. |
| `js/online.js` | Host-authoritative Trystero P2P adapter (host runs the engine; client is a thin view). |
| `js/main.js` | Bootstrap, menu/mode selection, wiring. |
| `content/board.json` | The sample strait board (nodes, typed lanes, entry/exit/chokepoint). |
| `content/config.json` | Balance knobs (oil target, fleet size, cargo, clock, budgets, popularity). |

**Host-authoritative online model:** the host holds the full authoritative state and runs the
engine; the client sends action requests and receives only its `projectView` result — opponent
hidden state is never serialized to a peer. **v1 is trust-based** (no cryptographic anti-cheat).

## Configuration

All balance is data in `content/config.json`:

```jsonc
{
  "oilTargetX": 12,        // US wins when delivered oil > this
  "fleetSize": 4,          // US tankers
  "perShipCargo": 5,       // oil per tanker
  "clockLength": 12,       // turns before the clock favors Iran
  "movementAllowance": 2,  // lane-steps per ship per turn
  "popularity": { "start": 10, "perShipLossCost": 2 },
  "placementBudget": { "total": 6, "perType": { "mine": 3, "ambush": 2, "sensor": 2 } },
  "draw": { "cadence": 1, "handSize": 5 },
  "seed": 12345            // RNG seed (reproducible games)
}
```

Edit the board in `content/board.json`; the validator guarantees every entry→exit path crosses a
chokepoint at load time.

## Roadmap / deferred

- **Cryptographic anti-cheat** (commit–reveal for hidden placements + jointly-seeded shuffles) for
  a trustless P2P mode. Designed but deferred — the engine's hidden-state encapsulation keeps this
  addable without a rewrite.
- Host migration on disconnect; AI opponent; multiple boards; accessibility polish.
