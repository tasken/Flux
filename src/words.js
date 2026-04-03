// Word emergence — split-flap cycler whose bitmap is sampled by the GPU shader
// with noise-warped UVs so words rise from and dissolve into the procedural field.

const WORDS = [
  'VOID',    'ABYSS',   'ORIGIN',  'SPARK',   'SILENCE', 'NOTHING',
  'SYSTEM',  'NETWORK', 'SYNAPSE', 'CIRCUIT', 'MEMORY',  'ENGINE',
  'NEBULA',  'ECLIPSE', 'HORIZON', 'GRAVITY', 'ORBIT',   'ZENITH',
  'BREATHE', 'PULSE',   'FLESH',   'MARROW',  'VISION',  'SPIRIT',
  'DECAY',   'ENTROPY', 'FRACTURE','SHADOW',  'WINTER',  'RUIN',
  'AWAKEN',  'EVOLVE',  'BECOME',  'TRANSCEND','BEYOND', 'INFINITE',
]

const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function createWordCycler(fontFamily) {
  let wordIndex  = 0
  let frameCount = 0
  let animating  = false

  const current = []   // current alphabet index per letter
  const target  = []   // target alphabet index per letter
  const delay   = []   // staggered start delay per letter

  // Small canvas — bilinear GPU sampling turns it into smooth gradients
  const canvas = document.createElement('canvas')
  canvas.width  = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  function pickNextWord() {
    const word = WORDS[wordIndex % WORDS.length]
    wordIndex++

    while (current.length < word.length) current.push(0)
    while (current.length > word.length) current.pop()
    target.length = word.length
    delay.length  = word.length

    for (let i = 0; i < word.length; i++) {
      const idx = ALPHABET.indexOf(word[i])
      target[i] = idx >= 0 ? idx : 0
      delay[i]  = i * 6   // 6-frame stagger per letter
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
    ctx.font = `bold 36px ${fontFamily}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = '#fff'
    ctx.fillText(word, width / 2, height / 2)
  }

  /** Call once per frame. Returns the canvas to upload as a GPU texture. */
  function update() {
    frameCount++
    if (frameCount % 300 === 1) pickNextWord()   // new word every ~5 s at 60 fps
    if (animating && frameCount % 2 === 0) stepFlap()
    render()
    return canvas
  }

  // Kick off the first word immediately
  pickNextWord()
  render()

  return { update, canvas }
}
