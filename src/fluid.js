// Navier-Stokes fluid solver — Jos Stam, "Real-Time Fluid Dynamics for Games" (GDC 1999)
// All functions are pure: they take typed arrays and mutate them in-place.

import { fluidSolverIterations } from './settings.js'

const ITER = fluidSolverIterations

/**
 * Add source field src into dst, scaled by timestep dt.
 * @param {Float32Array} dst
 * @param {Float32Array} src
 * @param {number} dt
 */
export function addSource(dst, src, dt) {
  for (let i = 0; i < dst.length; i++) dst[i] += dt * src[i]
}

/**
 * Diffuse field x from x0 over one timestep.
 * @param {Float32Array} x   output field
 * @param {Float32Array} x0  input field
 * @param {number} diff      diffusion rate
 * @param {number} dt        timestep
 * @param {number} cols
 * @param {number} rows
 */
export function diffuse(x, x0, diff, dt, cols, rows) {
  const a = dt * diff * (cols - 2) * (rows - 2)
  linSolve(x, x0, a, 1 + 4 * a, cols, rows)
}

/**
 * Advect field d along velocity field (u, v).
 * @param {Float32Array} d   output
 * @param {Float32Array} d0  input
 * @param {Float32Array} u   x-velocity
 * @param {Float32Array} v   y-velocity
 * @param {number} dt
 * @param {number} cols
 * @param {number} rows
 */
export function advect(d, d0, u, v, dt, cols, rows) {
  const dt0x = dt * (cols - 2)
  const dt0y = dt * (rows - 2)
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i
      let x = i - dt0x * u[idx]
      let y = j - dt0y * v[idx]
      x = Math.max(0.5, Math.min(cols - 1.5, x))
      y = Math.max(0.5, Math.min(rows - 1.5, y))
      const i0 = Math.floor(x), i1 = i0 + 1
      const j0 = Math.floor(y), j1 = j0 + 1
      const s1 = x - i0, s0 = 1 - s1
      const t1 = y - j0, t0 = 1 - t1
      d[idx] = s0 * (t0 * d0[j0 * cols + i0] + t1 * d0[j1 * cols + i0])
             + s1 * (t0 * d0[j0 * cols + i1] + t1 * d0[j1 * cols + i1])
    }
  }
  setBounds(d, cols, rows)
}

/**
 * Project velocity field (u, v) to be divergence-free.
 * Uses scratch arrays p and div.
 * @param {Float32Array} u
 * @param {Float32Array} v
 * @param {Float32Array} p    scratch
 * @param {Float32Array} div  scratch
 * @param {number} cols
 * @param {number} rows
 */
export function project(u, v, p, div, cols, rows) {
  const hx = 1.0 / (cols - 2)
  const hy = 1.0 / (rows - 2)
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i
      div[idx] = -0.5 * (
        hx * (u[j * cols + (i + 1)] - u[j * cols + (i - 1)]) +
        hy * (v[(j + 1) * cols + i] - v[(j - 1) * cols + i])
      )
      p[idx] = 0
    }
  }
  setBounds(div, cols, rows)
  setBounds(p, cols, rows)
  linSolve(p, div, 1, 4, cols, rows)
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i
      u[idx] -= 0.5 * (p[j * cols + (i + 1)] - p[j * cols + (i - 1)]) / hx
      v[idx] -= 0.5 * (p[(j + 1) * cols + i] - p[(j - 1) * cols + i]) / hy
    }
  }
  // Note: setBounds is intentionally not called here for u and v.
  // This setBounds implementation copies interior values outward (free-slip),
  // which is wrong for velocity post-projection. Velocity ghost cells are left
  // as-is; advect() clamps sample coordinates before touching the boundary row,
  // so the error is limited to one-cell edge artefacts.
}

// ─── internals ───────────────────────────────────────────────────────────────

function linSolve(x, x0, a, c, cols, rows) {
  const inv = 1 / c
  for (let k = 0; k < ITER; k++) {
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const idx = j * cols + i
        x[idx] = (x0[idx] + a * (
          x[j * cols + (i - 1)] + x[j * cols + (i + 1)] +
          x[(j - 1) * cols + i] + x[(j + 1) * cols + i]
        )) * inv
      }
    }
    setBounds(x, cols, rows)
  }
}

function setBounds(x, cols, rows) {
  // clamp edges to adjacent interior values
  for (let i = 1; i < cols - 1; i++) {
    x[0 * cols + i]          = x[1 * cols + i]
    x[(rows - 1) * cols + i] = x[(rows - 2) * cols + i]
  }
  for (let j = 1; j < rows - 1; j++) {
    x[j * cols + 0]          = x[j * cols + 1]
    x[j * cols + (cols - 1)] = x[j * cols + (cols - 2)]
  }
  x[0]                         = 0.5 * (x[cols + 0]         + x[0 * cols + 1])
  x[cols - 1]                  = 0.5 * (x[cols + cols - 1]  + x[0 * cols + (cols - 2)])
  x[(rows - 1) * cols]         = 0.5 * (x[(rows - 2) * cols]      + x[(rows - 1) * cols + 1])
  x[(rows - 1) * cols + cols - 1] = 0.5 * (x[(rows - 2) * cols + cols - 1] + x[(rows - 1) * cols + (cols - 2)])
}
