// Word emergence — split-flap cycler rendered as a small bitmap.
// The GPU shader samples this bitmap scaled to fill the entire screen,
// creating HUGE background letters made of smaller density characters.
// Inspired by the ertdfgcvb.xyz departure-board + giant-letter effect.
//
// Lifecycle per line:
//   arrive  → flap from space to target chars (center-out stagger)
//   hold    → line stays fully rendered for HOLD_STEPS flap ticks
//   transition → snapshot old line to departCtx (fades out),
//                load next line, new arrive starts simultaneously.
//                Depart fade completes in ~1/3 the arrive duration.

import { wordFlapStagger, wordFlapFrameSkip, wordCanvasWidth, wordCanvasHeight, wordFontSize, wordGlyphScaleY, wordGlyphLineHeight, wordHoldSteps, wordDepartFadeRatio, wordMaxLineChars, fontFamily } from './settings.js'

const LINES = [
  'WE LEFT ALL THE PAIN BEHIND',
  'WE DON\'T HAVE TO WORRY',
  'AND WE DON\'T HAVE TO HOLD ON',
  'TO PAIN WE LEFT BEHIND',
  'WOUNDS GET HEALED WITH TIME',
  'AND NOW YOU GOT ALL THE LOVE AND ALL THE SHINE',
  'YOU ALWAYS WANT IT ALL THE TIME, TONIGHT',
  'IT\'S WHAT YOU DESERVE',
  'AND NOW YOU GOT ALL THE LOVE AND ALL THE SHINE',
  'YOU ALWAYS WANT IT ALL THE TIME, YEAH, YEAH',
  'I SAID WE GOT ALL THE LOVE AND ALL THE SHINE',
  'YOU ALWAYS WANT IT ALL THE TIME',
]

const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?\'"0123456789-'


const W = wordCanvasWidth, H = wordCanvasHeight

export function createWordCycler() {
  let wordIndex     = 0
  let frameCount    = 0
  let phase         = 'arrive'   // 'arrive' | 'hold' | 'arrive+depart'
  let holdCounter   = 0

  // Depart state — lives independently so it persists across loadLine().
  let departOpacity        = 0
  let departFadeRate       = 0
  let departSnapshot       = []
  let departSnapshotLayout = []
  let departCharsLen       = 0

  const current = []
  const target  = []
  const delay   = []

  let targetLayout = []
  let currentCharsLen = 0
  let lastArriveSteps = 0   // track how long arrive took, for depart fade calc

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const departCanvas = document.createElement('canvas')
  departCanvas.width = W
  departCanvas.height = H
  const departCtx = departCanvas.getContext('2d')

  const idealSize = wordFontSize
  ctx.font = `bold ${idealSize}px ${fontFamily}`

  function glyphAdvance(ch) {
    const width = ctx.measureText(ch).width
    return ch === ' ' ? width * 0.75 : width
  }

  function runWidth(str) {
    let width = 0
    for (let i = 0; i < str.length; i++) width += glyphAdvance(str[i])
    return width
  }

  function findWrapIndex(str) {
    if (str.length <= wordMaxLineChars) return -1

    const mid = Math.floor(str.length * 0.5)
    let best = -1
    let bestDist = Infinity

    for (let i = 1; i < str.length - 1; i++) {
      if (str[i] !== ' ') continue
      const dist = Math.abs(i - mid)
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    }

    return best >= 0 ? best : mid
  }

  function buildLayout(charIndices) {
    let lastVisible = -1
    for (let i = charIndices.length - 1; i >= 0; i--) {
      if (charIndices[i] !== 0) { lastVisible = i; break }
    }
    if (lastVisible < 0) {
      return new Array(charIndices.length).fill(null).map(() => ({ x: W * 0.5, y: H * 0.5 }))
    }
    const metrics = ctx.measureText('Mg')
    const asc = metrics.fontBoundingBoxAscent ?? idealSize * 0.78
    const desc = metrics.fontBoundingBoxDescent ?? idealSize * 0.22
    const lineBox = asc + desc
    const lineAdvance = lineBox * wordGlyphLineHeight

    const str = charIndices
      .slice(0, lastVisible + 1)
      .map(i => ALPHABET[i])
      .join('')
    const wrapIndex = findWrapIndex(str)
    const line1 = wrapIndex < 0 ? str : str.slice(0, wrapIndex).trimEnd()
    const line2 = wrapIndex < 0 ? '' : str.slice(wrapIndex).trimStart()
    const totalHeight = line2 ? lineAdvance + lineBox : lineBox
    const topY = (H - totalHeight) * 0.5
    const y1 = topY + asc
    const y2 = line2 ? topY + lineAdvance + asc : y1
    const startX1 = W * 0.5 - runWidth(line1) * 0.5
    const startX2 = W * 0.5 - runWidth(line2) * 0.5

    const layout = new Array(charIndices.length)
    let x1 = startX1
    let x2 = startX2
    let row = 1

    for (let i = 0; i <= lastVisible; i++) {
      const ch = str[i]
      if (row === 1 && wrapIndex >= 0 && i >= wrapIndex) row = 2

      if (row === 1) {
        layout[i] = { x: x1, y: y1 }
        x1 += glyphAdvance(ch)
      } else {
        layout[i] = { x: x2, y: y2 }
        x2 += glyphAdvance(ch)
      }
    }

    const tailPos = row === 1 ? { x: x1, y: y1 } : { x: x2, y: y2 }
    for (let i = lastVisible + 1; i < charIndices.length; i++) {
      layout[i] = tailPos
    }
    return layout
  }

  function getLineChars(idx) {
    const word = LINES[idx % LINES.length].toUpperCase()
    return Array.from(word, ch => {
      const i = ALPHABET.indexOf(ch)
      return i >= 0 ? i : 0
    })
  }

  /** Estimate how many flap steps an arrive will take for a given line. */
  function estimateArriveSteps(chars) {
    const center = (chars.length - 1) * 0.5
    let maxSteps = 0
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === 0) continue  // space — no flapping
      const staggerDelay = Math.round(Math.abs(i - center)) * wordFlapStagger
      const cycles = chars[i]  // flap steps from 0 to target index
      maxSteps = Math.max(maxSteps, staggerDelay + cycles)
    }
    return maxSteps
  }

  function loadLine() {
    const chars = getLineChars(wordIndex)
    wordIndex++
    currentCharsLen = chars.length

    current.length = chars.length
    target.length  = chars.length
    delay.length   = chars.length

    const center = (chars.length - 1) * 0.5
    for (let i = 0; i < chars.length; i++) {
      current[i] = 0
      target[i]  = chars[i]
      delay[i]   = Math.round(Math.abs(i - center)) * wordFlapStagger
    }

    targetLayout = buildLayout(chars)
    lastArriveSteps = estimateArriveSteps(chars)
  }

  /** Snapshot current line to departCtx and start fade. */
  function startDepart() {
    departOpacity = 1.0
    departSnapshot = [...target]
    departSnapshotLayout = targetLayout
    departCharsLen = currentCharsLen

    // Fade out in ~1/3 of the next arrive duration.
    // Convert flap steps to frames (accounting for wordFlapFrameSkip).
    const nextChars = getLineChars(wordIndex)
    const nextArriveSteps = estimateArriveSteps(nextChars)
    const nextArriveFrames = Math.max(1, nextArriveSteps * wordFlapFrameSkip)
    const departFrames = Math.max(1, Math.round(nextArriveFrames * wordDepartFadeRatio))
    departFadeRate = 1.0 / departFrames
  }

  function stepFlap() {
    if (phase === 'arrive' || phase === 'arrive+depart') {
      let allArrived = true
      for (let i = 0; i < currentCharsLen; i++) {
        if (current[i] === target[i]) continue
        if (delay[i] > 0) {
          delay[i]--
          allArrived = false
          continue
        }
        current[i] = (current[i] + 1) % ALPHABET.length
        allArrived = false
      }
      if (allArrived) {
        // Line fully rendered — enter hold.
        phase = 'hold'
        holdCounter = wordHoldSteps
      }
    } else if (phase === 'hold') {
      holdCounter--
      if (holdCounter <= 0) {
        // Hold done — snapshot old line, load next, arrive+depart simultaneously.
        startDepart()
        loadLine()
        phase = 'arrive+depart'
      }
    }
  }

  function prepareTextRender(renderCtx) {
    const fontSize = idealSize
    const scaleY = Math.max(0, Math.min(1, wordGlyphScaleY))
    renderCtx.font = `bold ${fontSize}px ${fontFamily}`

    renderCtx.save()
    renderCtx.translate(0, H * 0.5 * (1 - scaleY))
    renderCtx.scale(1, Math.max(scaleY, 0.0001))
    renderCtx.textBaseline = 'alphabetic'
    renderCtx.textAlign    = 'left'
    renderCtx.fillStyle    = '#fff'
  }

  function finishTextRender(renderCtx) {
    renderCtx.restore()
  }

  function render() {
    // Main canvas: current line (arriving or fully rendered).
    ctx.clearRect(0, 0, W, H)
    prepareTextRender(ctx)
    for (let i = 0; i < currentCharsLen; i++) {
      const ch = ALPHABET[current[i]]
      if (ch === ' ') continue
      const pos = targetLayout[i]
      ctx.fillText(ch, pos.x, pos.y)
    }
    finishTextRender(ctx)

    // Depart canvas: old line fading out (independent of main lifecycle).
    departCtx.clearRect(0, 0, W, H)
    if (departOpacity > 0) {
      prepareTextRender(departCtx)
      departCtx.globalAlpha = departOpacity
      for (let i = 0; i < departCharsLen; i++) {
        const ch = ALPHABET[departSnapshot[i]]
        if (ch === ' ') continue
        departCtx.fillText(ch, departSnapshotLayout[i].x, departSnapshotLayout[i].y)
      }
      finishTextRender(departCtx)
      departOpacity = Math.max(0, departOpacity - departFadeRate)
    }
  }

  /** Call once per frame. Returns canvases + transition state for GPU upload. */
  function update() {
    let changed = false
    if (frameCount++ % wordFlapFrameSkip === 0) {
      stepFlap()
      changed = true
    }
    // Only re-render if we actually stepped the animation or if we are actively fading
    if (changed || phase === 'arrive+depart') {
      render()
    }
    return {
      canvas,
      departCanvas,
      hasDeparting: departOpacity > 0,
      changed: changed || phase === 'arrive+depart'
    }
  }

  // Start blank — first line animates in from nothing.
  loadLine()

  return { update, canvas, departCanvas }
}
