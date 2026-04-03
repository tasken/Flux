import { describe, it, expect } from 'vitest'

// The renderer module requires DOM/WebGL so we can't import it directly.
// Instead, test the contract: UNIFORM_NAMES and FULLSCREEN_QUAD are internal,
// but we can verify the public export shape by checking the module text.
// For real integration, use perf/benchmark.html in a browser.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rendererSrc = readFileSync(resolve(import.meta.dirname, 'renderer.js'), 'utf-8')

describe('renderer module contract', () => {
  it('exports createRenderer as a named export', () => {
    expect(rendererSrc).toMatch(/export\s+function\s+createRenderer/)
  })

  it('defines all expected uniform names', () => {
    const expected = [
      'u_time', 'u_resolution', 'u_gridSize', 'u_cellSize',
      'u_atlas', 'u_charCount', 'u_pointer', 'u_pointerDelta',
      'u_pointerActive', 'u_pointerDown', 'u_fluid',
      'u_seed', 'u_mode', 'u_wordTex',
    ]
    for (const name of expected) {
      expect(rendererSrc).toContain(`'${name}'`)
    }
  })

  it('has a dispose method', () => {
    expect(rendererSrc).toContain('dispose()')
  })

  it('has a recompile method for shader HMR', () => {
    expect(rendererSrc).toContain('recompile(')
  })

  it('measures max glyph width across chars (not just M)', () => {
    // Verify the atlas loop iterates over chars
    expect(rendererSrc).toMatch(/for\s*\(.*of chars\)/)
    expect(rendererSrc).toContain('Math.max')
  })

  it('handles DPR changes on resize', () => {
    expect(rendererSrc).toContain('devicePixelRatio')
    expect(rendererSrc).toMatch(/nextDpr\s*!==\s*dpr/)
  })
})
