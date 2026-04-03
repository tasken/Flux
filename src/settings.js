// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  settings.js — all tunable rendering constants in one place.               │
// └─────────────────────────────────────────────────────────────────────────────┘

// ── Grid / Font ───────────────────────────────────────────────────────────────
export const fontSize   = 12
export const fontFamily = "'IBM Plex Mono', monospace"
export const chars      = ' .·:;-=+*abcXYZ#@W'

// ── Word emergence ────────────────────────────────────────────────────────────
export const wordCanvas  = { width: 1024, height: 64 }
export const wordFontPx  = 40            // px size for lyric text on canvas
export const wordFlapStagger = 6         // frame delay per letter position
export const wordBreathMin   = 3.0       // zoom scale min (larger = bigger text on screen)
export const wordBreathMax   = 4.5       // zoom scale max
export const wordBreathSpeed = 1.1       // radians/time-unit
export const wordWarpX       = 0.04      // noise warp amplitude X
export const wordWarpY       = 0.06      // noise warp amplitude Y
export const wordBoost       = 0.22      // how much letters push the field value
export const wordGlow        = 0.12      // soft halo intensity around letters
export const wordGlowRadius  = 1.5       // texel multiplier for blur kernel

// ── Fluid simulation ─────────────────────────────────────────────────────────
export const fluidDiff      = 0.00001
export const fluidVisc      = 0.00001
export const fluidDt        = 0.12
export const fluidDecay     = 0.985

// ── Procedural field ─────────────────────────────────────────────────────────
export const fieldTimeScale  = 0.0006    // time → shader time multiplier
export const fieldAmplitude  = 0.65      // background noise strength

// ── Pointer interaction ──────────────────────────────────────────────────────
export const pointerForce       = 30     // velocity injection on move
export const pointerForceDown   = 80     // velocity injection on click
export const pointerDensity     = 5      // density injection on move
export const pointerDensityDown = 12     // density injection on click
export const pointerRadius      = 3      // injection radius (cells)
