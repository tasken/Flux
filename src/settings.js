// Centralized tuning surface for the renderer, simulation, and hover UI.

// ── Typography / Grid ────────────────────────────────────────────────────────
export const fontFamily = "'IBM Plex Mono', monospace"
export const fontSize = 12
export const lineHeight = 0.8

// Ordered sparse → dense for the procedural character field.
export const densityChars = ' _.,-=+:;cba!?0123456789$W#@Ñ'

// ── Giant Background Words ───────────────────────────────────────────────────
export const wordCanvasW = 1024
export const wordCanvasH = 128
export const wordFontSize = 75
export const wordFlapStagger = 6
export const wordFlapFrameSkip = 2

// `wordScaleY`: 1 keeps the glyphs at normal height, 0 compresses them maximally.
export const wordScaleY = 1

// `wordLineHeight`: 1 follows the font metrics, lower values tighten wrapped lines.
export const wordLineHeight = 0.78

// ── Fluid Simulation ─────────────────────────────────────────────────────────
export const fluidDiff = 0.00001
export const fluidVisc = 0.00001
export const fluidDt = 0.12
export const fluidDecay = 0.985
export const fluidIterations = 20

// ── Ambient Stirring ─────────────────────────────────────────────────────────
export const curlNoiseForce = 0.4
export const curlNoiseScale = 0.08
export const curlNoiseSpeed = 0.0004
export const ambientDensity = 0.15
export const ambientDensityPct = 0.002

// ── Procedural Field ─────────────────────────────────────────────────────────
export const fieldTimeScale = 0.0006
export const fieldAmplitude = 0.65

// ── Pointer Interaction ──────────────────────────────────────────────────────
export const pointerForce = 30
export const pointerForceDown = 80
export const pointerDensity = 5
export const pointerDensityDown = 12
export const pointerRadius = 3
export const pointerIdleMs = 160
export const pointerDeltaDecay = 0.82
