// Word emergence — split-flap cycler rendered as a small bitmap.
// The GPU shader samples this bitmap scaled to fill the entire screen,
// creating HUGE background letters made of smaller density characters.
// Inspired by the ertdfgcvb.xyz departure-board + giant-letter effect.

import { wordFlapStagger, wordFlapFrameSkip, wordCanvasW, wordCanvasH, wordFontSize, wordScaleY, wordLineHeight, fontFamily } from './settings.js'

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

const W = wordCanvasW, H = wordCanvasH

export function createWordCycler() {
  let wordIndex  = 0
  let frameCount = 0
  let phase      = 'arrive'

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
    const lineAdvance = lineBox * wordLineHeight

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

  function setCenterOutDelays(len) {
    const center = (len - 1) * 0.5
    for (let i = 0; i < len; i++) {
      delay[i] = Math.round(Math.abs(i - center)) * wordFlapStagger
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

    setCenterOutDelays(maxLen)

    targetLayout = buildLayout(target)
    nextLayout = buildLayout(next)
    phase = 'arrive'
  }

  function stepFlap() {
    if (phase === 'arrive') {
      let allArrived = true
      for (let i = 0; i < target.length; i++) {
        if (delay[i] > 0) { delay[i]--; allArrived = false; continue }
        if (current[i] !== target[i]) {
          current[i] = (current[i] + 1) % ALPHABET.length
          allArrived = false
        }
      }
      if (allArrived) {
        phase = 'depart'
        setCenterOutDelays(target.length)
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

  function render() {
    ctx.clearRect(0, 0, W, H)

    const fontSize = idealSize
    const scaleY = Math.max(0, Math.min(1, wordScaleY))
    ctx.font = `bold ${fontSize}px ${fontFamily}`

    ctx.save()
    // 1 keeps the original glyph height; 0 pushes toward maximum compression.
    ctx.translate(0, H * 0.5 * (1 - scaleY))
    ctx.scale(1, Math.max(scaleY, 0.0001))
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign    = 'left'
    ctx.fillStyle    = '#fff'
    for (let i = 0; i < current.length; i++) {
      const ch = ALPHABET[current[i]]
      if (ch === ' ') continue
      const pos = phase === 'depart' && delay[i] <= 0 ? nextLayout[i] : targetLayout[i]
      ctx.fillText(ch, pos.x, pos.y)
    }
    ctx.restore()
  }

  /** Call once per frame. Returns the canvas for GPU texture upload. */
  function update() {
    if (frameCount++ % wordFlapFrameSkip === 0) stepFlap()
    render()
    return canvas
  }

  loadLine()
  render()

  return { update, canvas }
}
