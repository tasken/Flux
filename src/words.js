// Word list + split-flap animation cycler.
// Renders 3-letter words as a bitmap texture for the GPU words mode.
// Inspired by the ertdfgcvb.xyz homepage departure-board animation.

// ── 3-letter word list (≈500 common English words) ────────────────────────────
// The first three entries spell "ert dfg cvb" — a nod to the studio name.

const WORDS = [
  // ── The Void / Origins ──
  'VOID', 'ABYSS', 'ORIGIN', 'SPARK', 'SILENCE', 'NOTHING',
  
  // ── The Machine / System ──
  'SYSTEM', 'NETWORK', 'SYNAPSE', 'CIRCUIT', 'MEMORY', 'ENGINE',
  
  // ── The Ethereal / Cosmic ──
  'NEBULA', 'ECLIPSE', 'HORIZON', 'GRAVITY', 'ORBIT', 'ZENITH',
  
  // ── The Existential / Organic ──
  'BREATHE', 'PULSE', 'FLESH', 'MARROW', 'VISION', 'SPIRIT',
  
  // ── The Fall / Dark ──
  'DECAY', 'ENTROPY', 'FRACTURE', 'SHADOW', 'WINTER', 'RUIN',
  
  // ── The Insight / Forward ──
  'AWAKEN', 'EVOLVE', 'BECOME', 'TRANSCEND', 'BEYOND', 'INFINITE'
]

const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// ── split-flap animation ──────────────────────────────────────────────────────
// Characters cycle through the alphabet toward their target, staggered per
// letter position — like an airport departure board.

export function createWordCycler(fontFamily) {
  let wordIndex  = 0
  let frameCount = 0
  let animating  = false

  const current = []   // dynamic array for current alphabet index
  const target  = []   // dynamic array for target alphabet index
  const delay   = []   // dynamic staggered start delay

  // Off-screen canvas for word bitmap (white text on transparent bg)
  const canvas = document.createElement('canvas')
  canvas.width  = 512  // Wider canvas to fit longer words
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  function pickNextWord() {
    const word = WORDS[wordIndex % WORDS.length].toUpperCase()
    wordIndex++
    
    // Resize flap arrays to match new word length
    while (current.length < word.length) current.push(0)
    while (current.length > word.length) current.pop()
    target.length = word.length
    delay.length = word.length

    for (let i = 0; i < word.length; i++) {
      const idx = ALPHABET.indexOf(word[i])
      target[i] = idx >= 0 ? idx : 0
      delay[i]  = i * 4  // slightly faster stagger to keep animation tight
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
    ctx.font = `bold 48px ${fontFamily}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = '#fff'
    ctx.fillText(word, width / 2, height / 2)
  }

  /** Call once per frame. Returns the canvas to upload as a GPU texture. */
  function update() {
    frameCount++
    if (frameCount % 240 === 1) pickNextWord()   // new word every ~4 s at 60 fps
    if (animating && frameCount % 2 === 0) stepFlap()
    render()
    return canvas
  }

  // Kick off the first word immediately
  pickNextWord()
  render()

  return { update, canvas }
}
