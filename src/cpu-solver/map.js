// Maps fluid simulation state to ABC character properties.
// All functions are pure — no side effects.

// Density ramp: sparse → dense, ordered by visual ink coverage.
// Inspired by ertdfgcvb's plasma.js approach: index a string with a
// normalised float to get a character that matches the visual weight.
const DENSITY = ' ·.-~:+ca01OX#@$'

// 8 unique directional arrows used at high velocity
const DIR_CHARS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']

/**
 * Return a character representing the fluid state at this cell.
 * Low/zero speed: density ramp (visual weight tracks how much fluid is here).
 * High speed: directional arrow (shows where the fluid is going).
 * @param {number} density  0–1+
 * @param {number} vx
 * @param {number} vy
 * @returns {string}
 */
export function flowChar(density, vx, vy) {
  const d = Math.min(density * 1.4, 1)
  const speed = Math.hypot(vx, vy)
  if (d < 0.005) return ' '
  if (speed > 0.3) {
    // fast-moving fluid: show direction
    const angle = Math.atan2(vy, vx)
    const sector = Math.round((angle / Math.PI) * 4)
    return DIR_CHARS[((sector % 8) + 8) % 8]
  }
  // slow / settling fluid: show density ramp
  return DENSITY[Math.min(DENSITY.length - 1, Math.floor(d * DENSITY.length))]
}

/**
 * Return a CSS hsl color string for a cell.
 * Hue is driven by vorticity (curl of velocity ≈ vy - vx for 2D).
 * Lightness is driven by density.
 * @param {number} density  0–1
 * @param {number} vx
 * @param {number} vy
 * @returns {string}
 */
export function densityColor(density, vx, vy) {
  const vorticity = vy - vx
  // Narrow hue range: base 210 (cool blue) ± 45° driven by vorticity.
  // Small multiplier keeps hue stable; the scene breathes rather than strobes.
  const hue = ((Math.round(210 + vorticity * 45) % 360) + 360) % 360
  // Fixed saturation — avoids colour "popping" as density fluctuates.
  const sat = 55
  // Lightness 0–60% (was 0–80%): stays darker, more atmospheric.
  const lightness = Math.round(Math.min(density, 1) * 60)
  return `hsl(${hue}, ${sat}%, ${lightness}%)`
}

/**
 * Return ABC fontWeight (300 | 400 | 700) based on velocity magnitude.
 * @param {number} vx
 * @param {number} vy
 * @returns {300 | 400 | 700}
 */
export function speedWeight(vx, vy) {
  const speed = Math.hypot(vx, vy)
  if (speed < 0.15) return 300
  if (speed < 0.5)  return 400
  return 700
}
