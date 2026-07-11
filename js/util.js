// util.js — small shared utilities.

/**
 * Portable deep clone. Uses structuredClone when available (modern browsers,
 * Node 17+) and falls back to JSON round-trip otherwise. Game state is fully
 * JSON-serializable (plain objects, arrays, numbers, strings, booleans), so the
 * fallback is exact.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
