// Centralized tuning surface for the renderer, simulation, and hover UI.

// ── Typography / Grid ────────────────────────────────────────────────────────
export const fontFamily = "'IBM Plex Mono', monospace"
export const gridFontSize = 12
export const gridLineHeight = 0.8

// Ordered sparse → dense for the procedural character field.
export const gridDensityChars = ' _.,-=+:;cba!?0123456789$W#@Ñ'

// ── Giant Background Words: Bitmap ───────────────────────────────────────────
export const wordCanvasWidth = 1024
export const wordCanvasHeight = 128
export const wordFontSize = 75

// ── Giant Background Words: Glyph Shape ─────────────────────────────────────
// `wordGlyphScaleY`: 1 keeps the glyphs at normal height, 0 compresses them maximally.
export const wordGlyphScaleY = 0.3

// `wordGlyphLineHeight`: 1 follows the font metrics, lower values tighten wrapped lines.
export const wordGlyphLineHeight = 0.75

// ── Giant Background Words: Animation ───────────────────────────────────────
export const wordFlapStagger = 6
export const wordFlapFrameSkip = 2

// Fade-out completes by this fraction of the incoming line's printed progress.
export const wordDepartFadeProgress = 0.2222

// ── Fluid Simulation ─────────────────────────────────────────────────────────
export const fluidDiffusion = 0.00001
export const fluidViscosity = 0.00001
export const fluidTimeStep = 0.12
export const fluidVelocityDecay = 0.985
export const fluidSolverIterations = 20

// ── Ambient Stirring ─────────────────────────────────────────────────────────
export const ambientCurlNoiseForce = 0.4
export const ambientCurlNoiseScale = 0.08
export const ambientCurlNoiseSpeed = 0.0004
export const ambientDensityAmount = 0.15
export const ambientDensityPct = 0.002

// ── Procedural Field ─────────────────────────────────────────────────────────
export const backgroundFieldTimeScale = 0.0006
export const backgroundFieldAmplitude = 0.65

// ── Pointer Interaction ──────────────────────────────────────────────────────
export const pointerMoveForce = 30
export const pointerDownForce = 80
export const pointerMoveDensity = 5
export const pointerDownDensity = 12
export const pointerRadius = 3
export const pointerIdleMs = 160
export const pointerDeltaDecay = 0.82
