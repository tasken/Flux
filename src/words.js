// Word emergence — split-flap cycler rendered as a small bitmap.
// The GPU shader samples this bitmap scaled to fill the entire screen,
// creating HUGE background letters made of smaller density characters.
// Inspired by the ertdfgcvb.xyz departure-board + giant-letter effect.

import { wordFlapStagger, wordFlapFrameSkip, wordCanvasW, wordCanvasH, fontFamily } from './settings.js'

const LINES = [
  'WE LEFT ALL THE PAIN BEHIND',
  'WE DON\'T HAVE TO WORRY',
  'WE DON\'T HAVE TO HOLD ON',
  'TO PAIN WE LEFT BEHIND',
  'WOUNDS GET HEALED WITH TIME',
  'ALL THE LOVE AND ALL THE SHINE',
  'YOU ALWAYS WANT IT ALL THE TIME',
  'TONIGHT',
  'IT\'S WHAT YOU DESERVE',
  'I SAID',
]

const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?\'"0123456789-'

const W = wordCanvasW, H = wordCanvasH

export function createWordCycler() {
  let wordIndex  = 0
  let frameCount = 0
  let phase      = 'arrive'

  const current = []
  const target  = []
  const next    = []
  const delay   = []

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

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
      delay[i]  = i * wordFlapStagger
    }
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
        for (let i = 0; i < target.length; i++) {
          delay[i] = i * wordFlapStagger
        }
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
    const word = current.map(i => ALPHABET[i]).join('')

    // Start with ideal font size, scale down if text overflows canvas width
    const idealSize = H * 0.82
    ctx.font = `bold ${idealSize}px ${fontFamily}`
    const measured = ctx.measureText(word)
    const scale = Math.min(1, (W * 0.94) / (measured.width || 1))
    if (scale < 1) ctx.font = `bold ${idealSize * scale}px ${fontFamily}`

    // Use real font metrics for vertical centering when available
    const m  = ctx.measureText(word)
    const asc  = m.fontBoundingBoxAscent  ?? idealSize * scale * 0.78
    const desc = m.fontBoundingBoxDescent ?? idealSize * scale * 0.22
    const yOff = (H - (asc + desc)) / 2 + asc

    ctx.textBaseline = 'alphabetic'
    ctx.textAlign    = 'center'
    ctx.fillStyle    = '#fff'
    ctx.fillText(word, W / 2, yOff)
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
