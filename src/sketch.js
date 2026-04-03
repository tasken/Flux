import { addSource, diffuse, advect, project } from './fluid.js'
import { flowChar, densityColor, speedWeight } from './map.js'

// ─── tuning constants ─────────────────────────────────────────────────────────
const DIFF      = 0.0001   // diffusion rate
const VISC      = 0.00001  // viscosity
const DT        = 0.1      // timestep
const FORCE     = 80       // velocity impulse magnitude on mouse move
const SOURCE    = 12       // density injection amount on mouse move
const RADIUS    = 3        // injection radius in cells
const PASSES    = 2        // solver passes per frame

// ─── simulation state ─────────────────────────────────────────────────────────
let cols, rows
let density, densityPrev
let vx, vy, vxPrev, vyPrev
let p, div  // scratch arrays for project()

export function boot(context) {
  cols = context.cols
  rows = context.rows
  const N = cols * rows
  density     = new Float32Array(N)
  densityPrev = new Float32Array(N)
  vx          = new Float32Array(N)
  vy          = new Float32Array(N)
  vxPrev      = new Float32Array(N)
  vyPrev      = new Float32Array(N)
  p   = new Float32Array(N)
  div = new Float32Array(N)
}

export function pre(context, cursor) {
  // inject fluid at cursor position
  const cx = Math.round(cursor.x)
  const cy = Math.round(cursor.y)
  const strength = cursor.pressed ? 3 : 1
  if (cx > 0 && cx < cols - 1 && cy > 0 && cy < rows - 1) {
    const dx = cursor.x - cursor.p.x
    const dy = cursor.y - cursor.p.y
    for (let dj = -RADIUS; dj <= RADIUS; dj++) {
      for (let di = -RADIUS; di <= RADIUS; di++) {
        if (di * di + dj * dj > RADIUS * RADIUS) continue
        const i = cx + di, j = cy + dj
        if (i < 1 || i >= cols - 1 || j < 1 || j >= rows - 1) continue
        const idx = j * cols + i
        densityPrev[idx] += SOURCE * strength
        vxPrev[idx]      += FORCE * dx * strength
        vyPrev[idx]      += FORCE * dy * strength
      }
    }
  }

  // run solver PASSES times
  for (let pass = 0; pass < PASSES; pass++) {
    // velocity step
    addSource(vx, vxPrev, DT)
    addSource(vy, vyPrev, DT)
    ;[vx, vxPrev] = [vxPrev, vx]
    diffuse(vx, vxPrev, VISC, DT, cols, rows)
    ;[vy, vyPrev] = [vyPrev, vy]
    diffuse(vy, vyPrev, VISC, DT, cols, rows)
    project(vx, vy, p, div, cols, rows)
    ;[vx, vxPrev] = [vxPrev, vx]
    ;[vy, vyPrev] = [vyPrev, vy]
    advect(vx, vxPrev, vxPrev, vyPrev, DT, cols, rows)
    advect(vy, vyPrev, vxPrev, vyPrev, DT, cols, rows)
    project(vx, vy, p, div, cols, rows)

    // density step
    addSource(density, densityPrev, DT)
    ;[density, densityPrev] = [densityPrev, density]  // diffuse reads prev, writes current
    diffuse(density, densityPrev, DIFF, DT, cols, rows)
    ;[density, densityPrev] = [densityPrev, density]  // advect reads prev, writes current
    advect(density, densityPrev, vx, vy, DT, cols, rows)
  }

  // decay previous buffers
  for (let i = 0; i < cols * rows; i++) {
    vxPrev[i]      *= 0.8
    vyPrev[i]      *= 0.8
    densityPrev[i] *= 0.8
  }
}

export function main({ x, y }, { cols }) {
  const i   = y * cols + x
  const d   = density[i]
  const u   = vx[i]
  const v   = vy[i]
  return {
    char:       flowChar(u, v),
    color:      densityColor(d, u, v),
    fontWeight: speedWeight(u, v),
  }
}

// document.querySelector is safe here: ES module <script> tags are always
// deferred — the DOM is fully parsed before this executes.
export const settings = {
  fps: 30,
  element: document.querySelector('#abc'),
}
