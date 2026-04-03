import { createRenderer } from './renderer.js'
import { vertexSource, fragmentSource, config } from './sketch.js'

// Wait for IBM Plex Mono to load before building the font atlas
document.fonts.ready.then(() => {
  const canvas   = document.getElementById('canvas')
  const renderer = createRenderer(canvas, { vertexSource, fragmentSource, ...config })

  function frame(now) {
    renderer.draw(now)
    requestAnimationFrame(frame)
  }

  window.addEventListener('resize', () => renderer.resize())
  renderer.resize()
  requestAnimationFrame(frame)
})
