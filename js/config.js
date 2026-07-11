// config.js — game configuration: defaults, normalization, validation.
//
// All balance levers live here as data. The engine reads config; it never
// hardcodes these numbers. Content JSON (content/config.json) can override
// any field; missing fields fall back to DEFAULT_CONFIG.

export const DEFAULT_CONFIG = {
  oilTargetX: 12,        // US wins when cumulative delivered oil > this
  fleetSize: 4,          // number of US tankers
  perShipCargo: 5,       // oil each tanker carries
  clockLength: 12,       // total turns before the clock favors Iran
  movementAllowance: 2,  // max lane-steps a ship may take per turn
  popularity: {
    start: 10,           // US popularity at game start
    perShipLossCost: 2,  // popularity lost when a US ship is sunk
  },
  placementBudget: {
    total: 6,            // max total Iran assets
    perType: { mine: 3, ambush: 2, sensor: 2 },
  },
  draw: {
    cadence: 1,          // cards drawn per side per turn
    handSize: 5,         // max cards held in hand
  },
  seed: 12345,           // default RNG seed
};

/** Deep-merge a partial override onto a base object (arrays replaced wholesale). */
function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (typeof base !== 'object' || Array.isArray(base)) return override;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    out[k] = deepMerge(base[k], override[k]);
  }
  return out;
}

/**
 * Produce a complete, validated config from an optional partial override.
 * @param {object} [override]
 * @returns {object} normalized config
 */
export function makeConfig(override = {}) {
  const cfg = deepMerge(DEFAULT_CONFIG, override);
  validateConfig(cfg);
  return cfg;
}

/** Throw if a config is structurally invalid. */
export function validateConfig(cfg) {
  const errors = [];
  const pos = (v, name) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      errors.push(`${name} must be a non-negative number (got ${v})`);
    }
  };
  pos(cfg.oilTargetX, 'oilTargetX');
  pos(cfg.fleetSize, 'fleetSize');
  pos(cfg.perShipCargo, 'perShipCargo');
  pos(cfg.clockLength, 'clockLength');
  pos(cfg.movementAllowance, 'movementAllowance');
  pos(cfg.popularity?.start, 'popularity.start');
  pos(cfg.popularity?.perShipLossCost, 'popularity.perShipLossCost');
  pos(cfg.placementBudget?.total, 'placementBudget.total');
  pos(cfg.draw?.cadence, 'draw.cadence');
  pos(cfg.draw?.handSize, 'draw.handSize');

  if (cfg.fleetSize < 1) errors.push('fleetSize must be >= 1');
  if (cfg.clockLength < 1) errors.push('clockLength must be >= 1');

  // Sanity: the fleet must be *able* to reach the oil target, else US can't win.
  const maxPossibleOil = cfg.fleetSize * cfg.perShipCargo;
  if (maxPossibleOil <= cfg.oilTargetX) {
    errors.push(
      `unwinnable config: fleetSize*perShipCargo (${maxPossibleOil}) must exceed oilTargetX (${cfg.oilTargetX})`
    );
  }

  const pt = cfg.placementBudget?.perType || {};
  const perTypeSum = (pt.mine || 0) + (pt.ambush || 0) + (pt.sensor || 0);
  if (perTypeSum < cfg.placementBudget?.total) {
    // not fatal, but the per-type caps then bind before the total; warn via error list off
  }

  if (errors.length) {
    throw new Error('Invalid game config:\n  - ' + errors.join('\n  - '));
  }
  return true;
}
