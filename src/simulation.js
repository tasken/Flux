// Wraps the CPU Navier-Stokes solver into a frame-steppable simulation.
// Exposes density + velocity as a packed RGBA Uint8Array for GPU texture upload.

import { addSource, diffuse, advect, project } from './fluid.js'
import { fluidDiff, fluidVisc, fluidDt, fluidDecay } from './settings.js'

const DIFF  = fluidDiff
const VISC  = fluidVisc
const DT    = fluidDt
const DECAY = fluidDecay

export function createSimulation(cols, rows) {
  const N = cols * rows

  const density     = new Float32Array(N)
  const densityPrev = new Float32Array(N)
  const vx          = new Float32Array(N)
  const vy          = new Float32Array(N)
  const vxPrev      = new Float32Array(N)
  const vyPrev      = new Float32Array(N)
  const p           = new Float32Array(N)
  const div         = new Float32Array(N)

  // RGBA texture data: R = density, G = vx (biased), B = vy (biased), A = speed
  const pixels = new Uint8Array(N * 4)

  let currentCols = cols
  let currentRows = rows

  function resize(newCols, newRows) {
    if (newCols === currentCols && newRows === currentRows) return

    const newN = newCols * newRows
    const arrays = [density, densityPrev, vx, vy, vxPrev, vyPrev, p, div]

    // Re-create all buffers at new size (clear state)
    for (let a = 0; a < arrays.length; a++) {
      arrays[a] = new Float32Array(newN)
    }

    // Reassign since Float32Array references changed
    Object.assign(state, {
      density: arrays[0], densityPrev: arrays[1],
      vx: arrays[2], vy: arrays[3],
      vxPrev: arrays[4], vyPrev: arrays[5],
      p: arrays[6], div: arrays[7],
    })

    currentCols = newCols
    currentRows = newRows
    state.pixels = new Uint8Array(newN * 4)
  }

  function injectForce(nx, ny, forceX, forceY, densityAmt, radius) {
    const ci = Math.floor(nx * currentCols)
    const cj = Math.floor(ny * currentRows)
    const r = radius || 3

    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 1 || i >= currentCols - 1 || j < 1 || j >= currentRows - 1) continue
        const dist = Math.sqrt(di * di + dj * dj)
        if (dist > r) continue
        const falloff = 1 - dist / r
        const idx = j * currentCols + i
        state.vxPrev[idx] += forceX * falloff
        state.vyPrev[idx] += forceY * falloff
        state.densityPrev[idx] += densityAmt * falloff
      }
    }
  }

  function step() {
    const c = currentCols
    const r = currentRows

    // Velocity step
    addSource(state.vx, state.vxPrev, DT)
    addSource(state.vy, state.vyPrev, DT)

    // Swap vx <-> vxPrev, vy <-> vyPrev for diffuse input
    let tmp
    tmp = state.vx; state.vx = state.vxPrev; state.vxPrev = tmp
    tmp = state.vy; state.vy = state.vyPrev; state.vyPrev = tmp

    diffuse(state.vx, state.vxPrev, VISC, DT, c, r)
    diffuse(state.vy, state.vyPrev, VISC, DT, c, r)
    project(state.vx, state.vy, state.p, state.div, c, r)

    tmp = state.vx; state.vx = state.vxPrev; state.vxPrev = tmp
    tmp = state.vy; state.vy = state.vyPrev; state.vyPrev = tmp

    advect(state.vx, state.vxPrev, state.vxPrev, state.vyPrev, DT, c, r)
    advect(state.vy, state.vyPrev, state.vxPrev, state.vyPrev, DT, c, r)
    project(state.vx, state.vy, state.p, state.div, c, r)

    // Density step
    addSource(state.density, state.densityPrev, DT)

    tmp = state.density; state.density = state.densityPrev; state.densityPrev = tmp

    diffuse(state.density, state.densityPrev, DIFF, DT, c, r)

    tmp = state.density; state.density = state.densityPrev; state.densityPrev = tmp

    advect(state.density, state.densityPrev, state.vx, state.vy, DT, c, r)

    // Decay + clear source buffers
    const N = c * r
    for (let i = 0; i < N; i++) {
      state.vx[i] *= DECAY
      state.vy[i] *= DECAY
      state.density[i] *= DECAY
      state.vxPrev[i] = 0
      state.vyPrev[i] = 0
      state.densityPrev[i] = 0
    }

    // Pack into RGBA pixels for GPU upload
    // R = density [0,1] → [0,255]
    // G = vx [-1,1] → [0,255] (128 = zero)
    // B = vy [-1,1] → [0,255] (128 = zero)
    // A = speed [0,1] → [0,255]
    const px = state.pixels
    for (let i = 0; i < N; i++) {
      const d = Math.min(1, Math.max(0, state.density[i]))
      const svx = Math.min(1, Math.max(-1, state.vx[i]))
      const svy = Math.min(1, Math.max(-1, state.vy[i]))
      const speed = Math.min(1, Math.sqrt(svx * svx + svy * svy))
      const off = i * 4
      px[off]     = (d * 255) | 0
      px[off + 1] = ((svx * 0.5 + 0.5) * 255) | 0
      px[off + 2] = ((svy * 0.5 + 0.5) * 255) | 0
      px[off + 3] = (speed * 255) | 0
    }
  }

  const state = {
    density, densityPrev, vx, vy, vxPrev, vyPrev, p, div, pixels,
    get cols() { return currentCols },
    get rows() { return currentRows },
    resize,
    injectForce,
    step,
  }

  return state
}
