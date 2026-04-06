// Word emergence — split-flap cycler rendered as a small bitmap.
// The GPU shader samples this bitmap scaled to fill the entire screen,
// creating HUGE background letters made of smaller density characters.
// Inspired by the ertdfgcvb.xyz departure-board + giant-letter effect.

import { wordFlapStagger, wordFlapFrameSkip, wordCanvasWidth, wordCanvasHeight, wordFontSize, wordGlyphScaleY, wordGlyphLineHeight, fontFamily } from './settings.js'

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
const MAX_LINE_CHARS = 23

const W = wordCanvasWidth, H = wordCanvasHeight

export function createWordCycler() {
  let wordIndex     = 0
  let frameCount    = 0
  let phase         = 'arrive'
  let departOpacity      = 0
  let departSnapshot     = []   // copy of target[] at moment depart begins
  let departSnapshotLayout = [] // corresponding layout (stable reference)

  const current = []
  const target  = []
  const next    = []
  const delay   = []

  let targetLayout = []
  let nextLayout = []

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
    if (str.length <= MAX_LINE_CHARS) return -1

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

  // Build per-slot positions from real font metrics so old and new lines
  // can coexist during a transition without moving each other.
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

  function setCenterOutDelays(buffer, len) {
    const center = (len - 1) * 0.5
    for (let i = 0; i < len; i++) {
      buffer[i] = Math.round(Math.abs(i - center)) * wordFlapStagger
    }
  }

  function getLineChars(idx) {
    const word = LINES[idx % LINES.length].toUpperCase()
    return Array.from(word, ch => {
      const i = ALPHABET.indexOf(ch)
      return i >= 0 ? i : 0
    })
  }

  function loadLine() {
    const chars     = getLineChars(wordIndex)
    const nextChars = getLineChars(wordIndex + 1)
    wordIndex++

    const maxLen = Math.max(chars.length, nextChars.length)
    while (current.length < maxLen) current.push(0)
    current.length = maxLen
    target.length  = maxLen
    next.length    = maxLen
    delay.length   = maxLen

    for (let i = 0; i < maxLen; i++) {
      target[i] = i < chars.length ? chars[i] : 0
      next[i]   = i < nextChars.length ? nextChars[i] : 0
    }

    setCenterOutDelays(delay, maxLen)

    targetLayout = buildLayout(target)
    nextLayout = buildLayout(next)
    phase = 'arrive'
    departOpacity = 0
  }


  function stepFlap() {
    if (phase === 'arrive') {
      let allArrived = true
      for (let i = 0; i < target.length; i++) {
        if (delay[i] > 0) { 
          delay[i]--; 
          allArrived = false; 
          continue; 
        }
        if (current[i] !== target[i]) {
          current[i] = (current[i] + 1) % ALPHABET.length;
          allArrived = false;
        }
      }
      if (allArrived) {
        phase = 'depart'
        departOpacity = 1.0
        departSnapshot = [...target]
        departSnapshotLayout = targetLayout
        setCenterOutDelays(delay, target.length)
      }
    } else {
      let allDone = true
      for (let i = 0; i < target.length; i++) {
        if (delay[i] > 0) { delay[i]--; allDone = false; continue }
        if (current[i] !== next[i]) {
          current[i] = (current[i] + 1) % ALPHABET.length
          allDone = false
        }
      }
      if (allDone) loadLine()
    }
  }



  function prepareTextRender(renderCtx) {
    const fontSize = idealSize
    const scaleY = Math.max(0, Math.min(1, wordGlyphScaleY))
    renderCtx.font = `bold ${fontSize}px ${fontFamily}`

    renderCtx.save()
    // 1 keeps the original glyph height; 0 pushes toward maximum compression.
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
    ctx.clearRect(0, 0, W, H)
    prepareTextRender(ctx)
    for (let i = 0; i < current.length; i++) {
      const ch = ALPHABET[current[i]]
      if (ch === ' ') continue
      const pos = (phase === 'depart' && current[i] !== target[i]) ? nextLayout[i] : targetLayout[i]
      ctx.fillText(ch, pos.x, pos.y)
    }
    finishTextRender(ctx)

    // Depart canvas fades out the old word — shader reads .a, so globalAlpha works correctly
    departCtx.clearRect(0, 0, W, H)
    if (departOpacity > 0) {
      prepareTextRender(departCtx)
      departCtx.globalAlpha = departOpacity
      for (let i = 0; i < departSnapshot.length; i++) {
        const ch = ALPHABET[departSnapshot[i]]
        if (ch === ' ') continue
        // Once this slot starts cycling toward the new line, the main canvas
        // takes over at nextLayout — stop reinforcing the old position.
        if (phase === 'depart' && i < current.length && current[i] !== target[i]) continue
        departCtx.fillText(ch, departSnapshotLayout[i].x, departSnapshotLayout[i].y)
      }
      finishTextRender(departCtx)
      departOpacity = Math.max(0, departOpacity - 0.008)
    }
  }

  /** Call once per frame. Returns canvases + transition state for GPU upload. */
  function update() {
    if (frameCount++ % wordFlapFrameSkip === 0) stepFlap()
    render()
    return {
      canvas,
      departCanvas,
      hasDeparting: departOpacity > 0,
    }
  }

  loadLine()
  render()

  return { update, canvas, departCanvas }
}
