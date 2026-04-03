import { createRenderer } from './renderer.js'
import { vertexSource, fragmentSource, config } from './sketch.js'
import { createSimulation } from './simulation.js'
import { createWordCycler } from './words.js'

function showBootError(message) {
  let panel = document.getElementById('boot-error')
  if (!panel) {
    panel = document.createElement('pre')
    panel.id = 'boot-error'
    panel.style.position = 'fixed'
    panel.style.inset = '16px'
    panel.style.margin = '0'
    panel.style.padding = '16px'
    panel.style.background = 'rgba(18, 20, 24, 0.92)'
    panel.style.color = '#f5f7ff'
    panel.style.border = '1px solid rgba(255, 255, 255, 0.18)'
    panel.style.font = '13px/1.5 monospace'
    panel.style.whiteSpace = 'pre-wrap'
    panel.style.zIndex = '10'
    document.body.append(panel)
  }

  panel.textContent = message
}

async function boot() {
  const canvas = document.getElementById('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Expected a <canvas id="canvas"> element in index.html')
  }

  if (!('fonts' in document) || !document.fonts?.ready) {
    throw new Error('Font loading API is not available in this browser')
  }

  await document.fonts.ready

  // Verify the intended font actually loaded (fonts.ready can resolve early on slow networks)
  const fontFamily = config.fontFamily.replace(/'/g, '')
  if (!document.fonts.check(`12px ${fontFamily}`)) {
    console.warn(`Font "${fontFamily}" not loaded, proceeding with fallback`)
  }

  const renderer = createRenderer(canvas, { vertexSource, fragmentSource, ...config })
  const wordCycler = createWordCycler(config.fontFamily)

  let sim = null  // created after first resize when grid dimensions are known
  const pointer = {
    x: 0.5,
    y: 0.5,
    dx: 0,
    dy: 0,
    active: 0,
    down: 0,
  }
  let rafId = 0
  let lastMoveAt = 0

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const nextX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const nextY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))

    pointer.dx = nextX - pointer.x
    pointer.dy = nextY - pointer.y
    pointer.x = nextX
    pointer.y = nextY
    pointer.active = 1
    lastMoveAt = performance.now()
  }

  function frame(now) {
    if (pointer.active && now - lastMoveAt > 160) {
      pointer.active = 0
    }

    // Inject pointer forces into the fluid sim
    if (sim && pointer.active) {
      const force = pointer.down ? 80 : 30
      const densityAmt = pointer.down ? 12 : 5
      sim.injectForce(pointer.x, pointer.y, pointer.dx * force, pointer.dy * force, densityAmt, 3)
    }

    // Step the simulation and upload to GPU
    if (sim) {
      sim.step()
      renderer.uploadFluid(sim.pixels, sim.cols, sim.rows)
    }

    // Update word bitmap each frame (cheap: small canvas + texture upload)
    const wordCanvas = wordCycler.update()
    renderer.uploadWordTexture(wordCanvas)

    pointer.dx *= 0.82
    pointer.dy *= 0.82
    renderer.draw(now, pointer)
    rafId = requestAnimationFrame(frame)
  }

  function handleResize() {
    const { cols, rows } = renderer.resize()
    if (!sim) {
      sim = createSimulation(cols, rows)
    } else {
      sim.resize(cols, rows)
    }
  }

  function handlePointerMove(event) {
    updatePointer(event)
  }

  function handlePointerEnter(event) {
    updatePointer(event)
    pointer.active = 1
  }

  function handlePointerLeave() {
    pointer.active = 0
    pointer.down = 0
  }

  function handlePointerDown(event) {
    updatePointer(event)
    pointer.down = 1
  }

  function handlePointerUp() {
    pointer.down = 0
  }

  window.addEventListener('resize', handleResize)
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerenter', handlePointerEnter)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointerup', handlePointerUp)

  handleResize()
  rafId = requestAnimationFrame(frame)

  if (import.meta.hot) {
    import.meta.hot.accept('./sketch.js', (newSketch) => {
      if (!newSketch) return
      try {
        renderer.recompile(newSketch.vertexSource, newSketch.fragmentSource)
      } catch (e) {
        console.error('Shader recompile failed:', e.message)
        showBootError(`Shader error — fix and save again.\n\n${e.message}`)
      }
    })

    import.meta.hot.dispose(() => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerenter', handlePointerEnter)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      renderer.dispose()
    })
  }
}

boot().catch((error) => {
  console.error(error)
  showBootError(`webArt failed to start.\n\n${error.message}`)
})
