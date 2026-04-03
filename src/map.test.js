import { describe, it, expect } from 'vitest'
import { flowChar, densityColor, speedWeight } from './map.js'

describe('flowChar', () => {
  it('returns · for zero velocity', () => {
    expect(flowChar(0, 0)).toBe('·')
  })
  it('returns - for rightward flow', () => {
    expect(flowChar(1, 0)).toBe('-')
  })
  it('returns | for downward flow', () => {
    expect(flowChar(0, 1)).toBe('|')
  })
  it('returns / for up-right diagonal', () => {
    expect(flowChar(1, -1)).toBe('/')
  })
  it('returns \\ for down-right diagonal', () => {
    expect(flowChar(1, 1)).toBe('\\')
  })
})

describe('densityColor', () => {
  it('returns a CSS hsl string', () => {
    const c = densityColor(0.5, 0.3, -0.2)
    expect(c).toMatch(/^hsl\(/)
  })
  it('returns black for zero density', () => {
    const c = densityColor(0, 0, 0)
    expect(c).toMatch(/hsl\(\d+, 80%, 0%\)/)
  })
})

describe('speedWeight', () => {
  it('returns 300 for zero speed', () => {
    expect(speedWeight(0, 0)).toBe(300)
  })
  it('returns 700 for speed >= 1', () => {
    expect(speedWeight(1, 0)).toBe(700)
  })
  it('returns 400 for mid speed', () => {
    const w = speedWeight(0.3, 0)
    expect(w).toBe(400)
  })
})
