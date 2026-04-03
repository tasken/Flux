// Word emergence — split-flap cycler whose bitmap is sampled by the GPU shader
// with noise-warped UVs so words rise from and dissolve into the procedural field.
//
// LINES is a sequential script — each entry appears once in order, then loops.

import {
  wordCanvas, wordFontPx, wordFlapStagger, fontFamily,
} from './settings.js'

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

export function createWordCycler() {
  let wordIndex  = 0
  let frameCount = 0
  let animating  = false

  const current = []   // current alphabet index per letter
  const target  = []   // target alphabet index per letter
  const delay   = []   // staggered start delay per letter

  // Wider canvas for full lyric lines — bilinear GPU sampling smooths it
  const canvas = document.createElement('canvas')
  canvas.width  = wordCanvas.width
  canvas.height = wordCanvas.height
  const ctx = canvas.getContext('2d')

  function pickNextWord() {
    const word = LINES[wordIndex % LINES.length].toUpperCase()
    wordIndex++

    while (current.length < word.length) current.push(0)
    while (current.length > word.length) current.pop()
    target.length = word.length
    delay.length  = word.length

    for (let i = 0; i < word.length; i++) {
      const idx = ALPHABET.indexOf(word[i])
      target[i] = idx >= 0 ? idx : 0
      delay[i]  = i * wordFlapStagger
    }
    animating = true
  }

  function stepFlap() {
    if (!animating) return
    let done = true
    for (let i = 0; i < target.length; i++) {
      if (delay[i] > 0) {
        delay[i]--
        done = false
      } else if (current[i] !== target[i]) {
        current[i] = (current[i] + 1) % ALPHABET.length
        done = false
      }
    }
    if (done) animating = false
  }

  function render() {
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const word = current.map(i => ALPHABET[i]).join('')
    ctx.font = `bold ${wordFontPx}px ${fontFamily}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = '#fff'
    ctx.fillText(word, width / 2, height / 2)
  }

  /** Call once per frame. Returns the canvas to upload as a GPU texture. */
  function update() {
    // Advance to next line only after the flap scan completes
    if (!animating) pickNextWord()
    if (animating && frameCount++ % 2 === 0) stepFlap()
    render()
    return canvas
  }

  // Kick off the first word immediately
  pickNextWord()
  render()

  return { update, canvas }
}
