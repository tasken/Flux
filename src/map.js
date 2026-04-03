// Maps fluid simulation state to ABC character properties.
// All functions are pure — no side effects.

// 8 unique directional arrows — each direction is visually distinct
const DIR_CHARS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗']

/**
 * Return a character representing the flow direction.
 * @param {number} vx
 * @param {number} vy
 * @returns {string}
 */
export function flowChar(vx, vy) {
  const speed = Math.hypot(vx, vy)
  if (speed < 0.001) return ' '
  if (speed < 0.04)  return '·'
  const angle = Math.atan2(vy, vx)
  const sector = Math.round((angle / Math.PI) * 4)
  return DIR_CHARS[((sector % 8) + 8) % 8]
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
  const hue = ((Math.round(200 + vorticity * 120) % 360) + 360) % 360
  const sat = Math.round(60 + Math.min(density, 1) * 40)
  const lightness = Math.round(Math.min(density, 1) * 80)
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
