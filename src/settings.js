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
export const wordFontSize      = 75      // fixed word font size (px)
export const wordScaleY        = 0.25    // intentional vertical squash on the word bitmap.
                                          // Values < 1 compress letters vertically, creating
                                          // the tall/narrow split-flap aesthetic in the
                                          // giant background characters. Tune freely (0.1–1.0).

// ── Fluid simulation ─────────────────────────────────────────────────────────
export const fluidDiff       = 0.00001
export const fluidVisc       = 0.00001
export const fluidDt         = 0.12
export const fluidDecay      = 0.985
export const fluidIterations = 20       // Gauss-Seidel solver iterations

// ── Ambient stirring ─────────────────────────────────────────────────────────
export const curlNoiseForce    = 0.4     // curl-noise velocity injection strength
export const curlNoiseScale    = 0.08    // spatial frequency of the curl field
export const curlNoiseSpeed    = 0.0004  // time multiplier for curl evolution
export const ambientDensity    = 0.15    // density injected per chosen cell per frame
export const ambientDensityPct = 0.002   // fraction of cells that receive density each frame

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
