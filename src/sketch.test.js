import { describe, it, expect } from 'vitest'
import { config, vertexSource, fragmentSource } from './sketch.js'

describe('sketch config', () => {
  it('exports a non-empty chars string', () => {
    expect(config.chars.length).toBeGreaterThan(0)
  })

  it('exports a fontSize > 0', () => {
    expect(config.fontSize).toBeGreaterThan(0)
  })

  it('exports a fontFamily string', () => {
    expect(typeof config.fontFamily).toBe('string')
    expect(config.fontFamily.length).toBeGreaterThan(0)
  })

  it('chars does not contain duplicates', () => {
    const unique = new Set(config.chars)
    expect(unique.size).toBe(config.chars.length)
  })
})

describe('shader sources', () => {
  it('exports a vertex shader containing gl_Position', () => {
    expect(vertexSource).toContain('gl_Position')
  })

  it('exports a fragment shader containing gl_FragColor', () => {
    expect(fragmentSource).toContain('gl_FragColor')
  })

  it('fragment shader declares all expected uniforms', () => {
    const expected = [
      'u_time', 'u_resolution', 'u_gridSize', 'u_cellSize',
      'u_atlas', 'u_charCount', 'u_pointer', 'u_pointerDelta',
      'u_pointerActive', 'u_pointerDown', 'u_fluid',
      'u_seed', 'u_mode', 'u_wordTex',
    ]
    for (const name of expected) {
      expect(fragmentSource).toContain(name)
    }
  })

  it('vertex shader declares the a_position attribute', () => {
    expect(vertexSource).toContain('a_position')
  })
})
