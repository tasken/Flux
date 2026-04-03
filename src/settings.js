// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  settings.js — all tunable rendering constants in one place.               │
// └─────────────────────────────────────────────────────────────────────────────┘

// ── Grid / Font ───────────────────────────────────────────────────────────────
export const fontSize   = 12
export const fontFamily = "'IBM Plex Mono', monospace"

// Density chars: ordered sparse → dense, used for procedural background.
export const densityChars = ' .·:;-=+*abcXYZ#@W'

// All characters that can appear in word text.
const wordAlphabet = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!\'"0123456789-'

// Combined atlas: density chars first, then word chars not already present.
const extraWord = [...wordAlphabet].filter(c => !densityChars.includes(c))
export const chars = densityChars + extraWord.join('')

// ── Word emergence ────────────────────────────────────────────────────────────
export const wordFlapStagger   = 6       // frame delay per letter position
export const wordFlapFrameSkip = 2       // step flap every N frames
export const wordCanvasW       = 1024    // word bitmap width  (px)
export const wordCanvasH       = 128     // word bitmap height (px)

// ── Fluid simulation ─────────────────────────────────────────────────────────
export const fluidDiff       = 0.00001
export const fluidVisc       = 0.00001
export const fluidDt         = 0.12
export const fluidDecay      = 0.985
export const fluidIterations = 20       // Gauss-Seidel solver iterations

// ── Procedural field ─────────────────────────────────────────────────────────
export const fieldTimeScale  = 0.0006    // time → shader time multiplier
export const fieldAmplitude  = 0.65      // background noise strength

// ── Pointer interaction ──────────────────────────────────────────────────────
export const pointerForce       = 30     // velocity injection on move
export const pointerForceDown   = 80     // velocity injection on click
export const pointerDensity     = 5      // density injection on move
export const pointerDensityDown = 12     // density injection on click
export const pointerRadius      = 3      // injection radius (cells)
export const pointerIdleMs      = 160    // ms before pointer is inactive
export const pointerDeltaDecay  = 0.82   // delta smoothing per frame
