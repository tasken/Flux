import { describe, it, expect } from 'vitest'
import { addSource, diffuse, project } from './fluid.js'

describe('addSource', () => {
  it('adds source values scaled by dt into destination', () => {
    const dst = new Float32Array([0, 0, 0])
    const src = new Float32Array([1, 2, 3])
    addSource(dst, src, 0.1)
    expect(dst[0]).toBeCloseTo(0.1)
    expect(dst[1]).toBeCloseTo(0.2)
    expect(dst[2]).toBeCloseTo(0.3)
  })
})

describe('diffuse', () => {
  it('spreads a central value to its neighbours after one call', () => {
    const cols = 5, rows = 5
    const N = cols * rows
    const x   = new Float32Array(N)
    const x0  = new Float32Array(N)
    // place a spike in the center
    x0[2 * cols + 2] = 1.0
    diffuse(x, x0, 1, 0.1, 1, cols, rows)
    // center should be less than 1 (spread out)
    expect(x[2 * cols + 2]).toBeLessThan(1.0)
    // at least one neighbour should be non-zero
    expect(x[1 * cols + 2] + x[3 * cols + 2]).toBeGreaterThan(0)
  })
})

describe('project', () => {
  it('reduces divergence of velocity field', () => {
    const cols = 6, rows = 6
    const N = cols * rows
    // create a simple divergent field (pointing outward from center)
    const vx = new Float32Array(N)
    const vy = new Float32Array(N)
    const p  = new Float32Array(N)
    const div = new Float32Array(N)
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        vx[j * cols + i] = i - cols / 2
        vy[j * cols + i] = j - rows / 2
      }
    }
    // compute divergence before projection
    let divBefore = 0
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        divBefore += Math.abs(
          vx[j * cols + (i + 1)] - vx[j * cols + (i - 1)] +
          vy[(j + 1) * cols + i] - vy[(j - 1) * cols + i]
        )
      }
    }
    project(vx, vy, p, div, cols, rows)
    // compute divergence after projection
    let divAfter = 0
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        divAfter += Math.abs(
          vx[j * cols + (i + 1)] - vx[j * cols + (i - 1)] +
          vy[(j + 1) * cols + i] - vy[(j - 1) * cols + i]
        )
      }
    }
    expect(divAfter).toBeLessThan(divBefore)
  })
})
