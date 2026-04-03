import { describe, it, expect } from 'vitest'
import { flowChar, densityColor, speedWeight } from './map.js'

describe('flowChar', () => {
  it('returns space for zero density', () => {
    expect(flowChar(0, 0, 0)).toBe(' ')
  })
  it('returns a density ramp char for slow fluid', () => {
    // slow speed, medium density — should pick from DENSITY string, not an arrow
    const c = flowChar(0.5, 0.05, 0)
    expect(c).not.toBe('→')
    expect(c).not.toBe(' ')
  })
  it('returns → for fast rightward flow', () => {
    expect(flowChar(0.5, 1, 0)).toBe('→')
  })
  it('returns ↓ for fast downward flow', () => {
    expect(flowChar(0.5, 0, 1)).toBe('↓')
  })
  it('returns ↗ for fast up-right flow', () => {
    expect(flowChar(0.5, 1, -1)).toBe('↗')
  })
  it('returns ↘ for fast down-right flow', () => {
    expect(flowChar(0.5, 1, 1)).toBe('↘')
  })
})

describe('densityColor', () => {
  it('returns a CSS hsl string', () => {
    const c = densityColor(0.5, 0.3, -0.2)
    expect(c).toMatch(/^hsl\(/)
  })
  it('returns zero lightness for zero density', () => {
    const c = densityColor(0, 0, 0)
    expect(c).toMatch(/hsl\(\d+, \d+%, 0%\)/)
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
