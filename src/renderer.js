// WebGL character-grid renderer.
// Renders a fullscreen quad whose fragment shader computes per-cell procedural
// values and samples a font texture atlas to draw styled characters on the GPU.

const FULLSCREEN_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const UNIFORM_NAMES = [
  'u_time',
  'u_resolution',
  'u_gridSize',
  'u_cellSize',
  'u_atlas',
  'u_charCount',
  'u_pointer',
  'u_pointerDelta',
  'u_pointerActive',
  'u_pointerDown',
  'u_fluid',
  'u_seed',
  'u_wordTex',
  'u_wordDepartTex',
  'u_overlayTex',
  'u_fieldTimeScale',
  'u_fieldAmplitude',
  'u_wordAspect',
  'u_densityCharCount',
]

// ── shader compilation ────────────────────────────────────────────────────────

function compile(gl, type, source) {
  const s = gl.createShader(type)
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error(`Shader compile:\n${log}`)
  }
  return s
}

function link(gl, vs, fs) {
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p)
    gl.deleteProgram(p)
    throw new Error(`Program link:\n${log}`)
  }
  return p
}

function getAttrib(gl, program, name) {
  const location = gl.getAttribLocation(program, name)
  if (location < 0) throw new Error(`Missing shader attribute: ${name}`)
  return location
}

function getUniforms(gl, program, names) {
  // Locations may be null when a GLSL compiler optimises away a uniform
  // (common on mobile GPUs).  WebGL treats gl.uniform*() with a null
  // location as a silent no-op, so storing null here is safe and lets
  // the renderer degrade gracefully instead of crashing.
  const locations = {}
  for (const name of names) {
    locations[name] = gl.getUniformLocation(program, name)
  }
  return locations
}

// ── font atlas ────────────────────────────────────────────────────────────────
// Renders every character in `chars` into a single-row RGBA texture.
// The alpha channel carries the antialiased glyph shape.

function createAtlas(gl, chars, fontSize, fontFamily, cellWidthUnits = 1, cellHeightUnits = 1) {
  const tmp = document.createElement('canvas')
  const tctx = tmp.getContext('2d')
  if (!tctx) throw new Error('2D canvas context not available for font atlas')
  tctx.font = `${fontSize}px ${fontFamily}`

  let charWidth = 0
  for (const ch of chars) {
    if (ch === ' ') continue
    charWidth = Math.max(charWidth, Math.ceil(tctx.measureText(ch).width))
  }
  if (charWidth === 0) charWidth = Math.ceil(tctx.measureText('M').width)

  // Use real font metrics for accurate cell height (with fallback)
  const mRef    = tctx.measureText('Mg|')
  const ascent  = Math.ceil(mRef.fontBoundingBoxAscent  ?? fontSize * 0.85)
  const safeCellWidthUnits = Math.max(1, cellWidthUnits)
  const safeCellHeightUnits = Math.max(1, cellHeightUnits)
  const charHeight = Math.max(1, Math.ceil(charWidth * safeCellHeightUnits / safeCellWidthUnits))

  const atlas = document.createElement('canvas')
  atlas.width  = charWidth * chars.length
  atlas.height = charHeight
  const ctx = atlas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context not available for atlas rendering')

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign    = 'center'
  ctx.fillStyle = '#fff'
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * charWidth + charWidth * 0.5, ascent)
  }

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  return { tex, charWidth, charHeight }
}

// ── public API ────────────────────────────────────────────────────────────────

export function createRenderer(canvas, opts) {
  const {
    vertexSource,
    fragmentSource,
    fontSize,
    cellWidthUnits = 1,
    cellHeightUnits = 1,
    fontFamily,
    chars,
  } = opts
  let staticUniforms = opts.staticUniforms || {}
  if (!chars?.length) throw new Error('Renderer requires at least one character')

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) throw new Error('WebGL not available')

  let program = link(
    gl,
    compile(gl, gl.VERTEX_SHADER, vertexSource),
    compile(gl, gl.FRAGMENT_SHADER, fragmentSource),
  )
  let dpr = window.devicePixelRatio || 1
  let atlas = createAtlas(gl, chars, Math.round(fontSize * dpr), fontFamily, cellWidthUnits, cellHeightUnits)

  // fullscreen quad  (-1…1 clip space)
  const buf = gl.createBuffer()
  if (!buf) throw new Error('Failed to allocate vertex buffer')
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD, gl.STATIC_DRAW)

  let aPos = getAttrib(gl, program, 'a_position')
  const u = getUniforms(gl, program, UNIFORM_NAMES)

  function applyStaticUniforms() {
    gl.useProgram(program)
    for (const [name, value] of Object.entries(staticUniforms)) {
      if (u[name] !== undefined) gl.uniform1f(u[name], value)
    }
  }

  function bindAtlas() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, atlas.tex)
    gl.uniform1i(u.u_atlas, 0)
    gl.uniform1f(u.u_charCount, chars.length)
  }

  // Fluid data texture (RGBA32F, one texel per grid cell)
  let fluidTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, fluidTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Pre-allocate empty texture — we will use texSubImage2D to update it
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null)

  function bindFluid() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, fluidTex)
    gl.uniform1i(u.u_fluid, 1)
  }

  // Word bitmap texture (small canvas scaled to fill the screen — LINEAR for smooth upscale)
  let wordTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, wordTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Pre-allocate to allow texSubImage2D updates
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  function bindWord() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, wordTex)
    gl.uniform1i(u.u_wordTex, 2)
  }

  let wordDepartTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, wordDepartTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Pre-allocate to allow texSubImage2D updates
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  function bindWordDepart() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, wordDepartTex)
    gl.uniform1i(u.u_wordDepartTex, 3)
  }

  let overlayTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, overlayTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  function bindOverlay() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, overlayTex)
    gl.uniform1i(u.u_overlayTex, 4)
  }

  bindAtlas()
  bindFluid()
  bindWord()
  bindWordDepart()
  bindOverlay()

  // Random seed set once per session — offsets time so each load looks different
  const seed = Math.random() * 1e5
  gl.useProgram(program)
  gl.uniform1f(u.u_seed, seed)
  applyStaticUniforms()

  let fluidCols = 1
  let fluidRows = 1

  return {
    resize() {
      const nextDpr = window.devicePixelRatio || 1
      if (nextDpr !== dpr) {
        dpr = nextDpr
        gl.deleteTexture(atlas.tex)
        atlas = createAtlas(gl, chars, Math.round(fontSize * dpr), fontFamily, cellWidthUnits, cellHeightUnits)
        bindAtlas()
      }

      canvas.width  = canvas.clientWidth  * dpr
      canvas.height = canvas.clientHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)

      const cols = Math.max(1, Math.floor(canvas.width  / atlas.charWidth))
      const rows = Math.max(1, Math.floor(canvas.height / atlas.charHeight))

      // Reallocate fluid texture if size changed
      if (cols !== fluidCols || rows !== fluidRows) {
        fluidCols = cols
        fluidRows = rows
        gl.bindTexture(gl.TEXTURE_2D, fluidTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, fluidCols, fluidRows, 0, gl.RGBA, gl.FLOAT, null)
      }

      gl.useProgram(program)
      gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u.u_gridSize, cols, rows)
      gl.uniform2f(u.u_cellSize, atlas.charWidth, atlas.charHeight)

      return { cols, rows }
    },

    draw(time, pointer = {}) {
      const {
        x = 0.5,
        y = 0.5,
        dx = 0,
        dy = 0,
        active = 0,
        down = 0,
      } = pointer

      gl.useProgram(program)
      gl.uniform1f(u.u_time, time)
      gl.uniform2f(u.u_pointer, x, y)
      gl.uniform2f(u.u_pointerDelta, dx, dy)
      gl.uniform1f(u.u_pointerActive, active)
      gl.uniform1f(u.u_pointerDown, down)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },

    recompile(newVertexSource, newFragmentSource, newStaticUniforms) {
      const newProgram = link(
        gl,
        compile(gl, gl.VERTEX_SHADER, newVertexSource),
        compile(gl, gl.FRAGMENT_SHADER, newFragmentSource),
      )
      gl.deleteProgram(program)
      program = newProgram
      aPos = getAttrib(gl, program, 'a_position')
      Object.assign(u, getUniforms(gl, program, UNIFORM_NAMES))
      if (newStaticUniforms) staticUniforms = newStaticUniforms
      bindAtlas()
      bindFluid()
      bindWord()
      bindWordDepart()
      bindOverlay()
      gl.useProgram(program)
      gl.uniform1f(u.u_seed, seed)
      applyStaticUniforms()
      this.resize()
    },

    uploadFluid(pixels, cols, rows) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, fluidTex)
      // Use texSubImage2D instead of texImage2D to avoid GPU reallocation
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, pixels)
    },

    uploadWordTexture(canvas) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, wordTex)
      if (canvas.width > 0 && canvas.height > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      }
    },

    uploadDepartWordTexture(canvas) {
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, wordDepartTex)
      if (canvas.width > 0 && canvas.height > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      }
    },

    uploadOverlay(pixels, cols, rows) {
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, overlayTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    },

    dispose() {
      gl.deleteTexture(atlas.tex)
      gl.deleteTexture(fluidTex)
      gl.deleteTexture(wordTex)
      gl.deleteTexture(wordDepartTex)
      gl.deleteTexture(overlayTex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
    },
  }
}
