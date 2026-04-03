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
const AMB_SRC   = 0.6      // ambient density per injected cell per frame
const AMB_FORCE = 1.8      // ambient velocity impulse per cell (curl-noise)
const CURL_STEP = 6        // inject curl noise every N cells
const DECAY     = 0.997    // per-frame density decay to prevent saturation
const VEL_DECAY = 0.988    // per-frame velocity decay (linear drag) — keeps speed bounded

// ─── cheap fBm noise ─────────────────────────────────────────────────────────
// Fractional Brownian motion via 3 sin/cos octaves — no external dep needed.
// Returns a smooth scalar in roughly [-1, 1].
function fbm(x, y, t) {
  let v = 0, amp = 0.5, freq = 1
  for (let oct = 0; oct < 3; oct++) {
    v    += amp * Math.sin(x * freq + t * (0.07 + oct * 0.04))
                * Math.cos(y * freq + t * (0.05 + oct * 0.03))
    amp  *= 0.5
    freq *= 2.1
  }
  return v
}

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

  // Seed with a curl-noise pattern so there's immediate motion on load
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i
      const nx = (i / cols) * Math.PI * 6
      const ny = (j / rows) * Math.PI * 6
      vx[idx] = Math.sin(ny) * Math.cos(nx * 0.5) * 0.4
      vy[idx] = -Math.sin(nx) * Math.cos(ny * 0.5) * 0.4
      density[idx] = Math.max(0, Math.sin(nx * 0.8) * Math.cos(ny * 0.8)) * 0.4
    }
  }
}

export function pre(context, cursor) {
  // curl-noise ambient injection — sample the gradient of an fBm potential field
  // on a sparse grid. Because vx = ∂ψ/∂y and vy = -∂ψ/∂x the field is
  // divergence-free by construction, so no net drift accumulates over time.
  const t = context.time
  const h = 0.5   // finite-difference step for gradient approximation
  for (let j = 1; j < rows - 1; j += CURL_STEP) {
    for (let i = 1; i < cols - 1; i += CURL_STEP) {
      // normalise to roughly [0, 2π] so fbm sees a consistent scale
      const nx = (i / cols) * 6.28
      const ny = (j / rows) * 6.28
      // curl: vx = ∂ψ/∂y,  vy = -∂ψ/∂x
      const curlX =  (fbm(nx, ny + h, t) - fbm(nx, ny - h, t)) / (2 * h)
      const curlY = -(fbm(nx + h, ny, t) - fbm(nx - h, ny, t)) / (2 * h)
      const idx = j * cols + i
      vxPrev[idx]      += curlX * AMB_FORCE
      vyPrev[idx]      += curlY * AMB_FORCE
      densityPrev[idx] += AMB_SRC
    }
  }

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

  // decay previous buffers and apply gentle density decay to prevent saturation
  for (let i = 0; i < cols * rows; i++) {
    vxPrev[i]      *= 0.8
    vyPrev[i]      *= 0.8
    densityPrev[i] *= 0.8
    density[i]     *= DECAY
    vx[i]          *= VEL_DECAY
    vy[i]          *= VEL_DECAY
  }
}

export function main({ x, y }, { cols }) {
  const i   = y * cols + x
  const d   = density[i]
  const u   = vx[i]
  const v   = vy[i]
  return {
    char:       flowChar(d, u, v),
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
