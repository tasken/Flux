const OVERLAY_ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-_'
const OVERLAY_FRAME_SKIP = 1
const OVERLAY_STAGGER = 1

function buildTargetGrid(lines, cols, rows) {
  const grid = new Uint8Array(cols * rows)
  const normalizedLines = lines
    .map(line => String(line ?? '').toUpperCase())
    .slice(0, rows)

  const startRow = Math.max(0, rows - normalizedLines.length)
  for (let row = 0; row < normalizedLines.length; row++) {
    const line = normalizedLines[row]
    const startCol = Math.max(0, cols - line.length)
    for (let col = 0; col < line.length && col < cols; col++) {
      const idx = OVERLAY_ALPHABET.indexOf(line[col])
      if (idx < 0) continue
      grid[(startRow + row) * cols + startCol + col] = idx
    }
  }

  return grid
}

export function createCharOverlay(lines, atlasChars) {
  let cols = 1
  let rows = 1
  let frameCount = 0
  let current = new Uint8Array(cols * rows)
  let target = new Uint8Array(cols * rows)
  let delay = new Uint16Array(cols * rows)
  let pixels = new Uint8Array(cols * rows * 4)
  let visible = false

  function rebuildTarget() {
    target = buildTargetGrid(visible ? lines : [''], cols, rows)
    delay = new Uint16Array(cols * rows)

    let order = 0
    for (let i = 0; i < target.length; i++) {
      if (current[i] === target[i]) continue
      delay[i] = order * OVERLAY_STAGGER
      order++
    }
  }

  function syncPixels() {
    pixels = new Uint8Array(cols * rows * 4)
    for (let i = 0; i < current.length; i++) {
      const overlayIdx = current[i]
      if (overlayIdx === 0) continue

      const ch = OVERLAY_ALPHABET[overlayIdx]
      const atlasIdx = atlasChars.indexOf(ch)
      if (atlasIdx < 0) continue

      const p = i * 4
      pixels[p] = atlasIdx
      pixels[p + 3] = 255
    }
  }

  function step() {
    let changed = false
    for (let i = 0; i < current.length; i++) {
      if (delay[i] > 0) {
        delay[i]--
        continue
      }
      if (current[i] === target[i]) continue
      current[i] = (current[i] + 1) % OVERLAY_ALPHABET.length
      changed = true
    }
    if (changed) syncPixels()
  }

  function resize(nextCols, nextRows) {
    cols = Math.max(1, nextCols)
    rows = Math.max(1, nextRows)
    current = new Uint8Array(cols * rows)
    target = new Uint8Array(cols * rows)
    delay = new Uint16Array(cols * rows)
    pixels = new Uint8Array(cols * rows * 4)
    rebuildTarget()
    syncPixels()
  }

  function show() {
    visible = true
    rebuildTarget()
  }

  function hide() {
    visible = false
    rebuildTarget()
  }

  function update() {
    if (frameCount++ % OVERLAY_FRAME_SKIP === 0) step()
    return { pixels, cols, rows }
  }

  return { resize, show, hide, update }
}
