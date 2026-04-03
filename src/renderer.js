// WebGL character-grid renderer.
// Renders a fullscreen quad whose fragment shader computes per-cell procedural
// values and samples a font texture atlas to draw styled characters on the GPU.

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

// ── font atlas ────────────────────────────────────────────────────────────────
// Renders every character in `chars` into a single-row RGBA texture.
// The alpha channel carries the antialiased glyph shape.

function createAtlas(gl, chars, fontSize, fontFamily) {
  const tmp = document.createElement('canvas')
  const tctx = tmp.getContext('2d')
  tctx.font = `${fontSize}px ${fontFamily}`

  const charWidth  = Math.ceil(tctx.measureText('M').width)
  const charHeight = Math.ceil(fontSize * 1.35)

  const atlas = document.createElement('canvas')
  atlas.width  = charWidth * chars.length
  atlas.height = charHeight
  const ctx = atlas.getContext('2d')

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * charWidth, charHeight * 0.5)
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
  const { vertexSource, fragmentSource, fontSize, fontFamily, chars } = opts

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) throw new Error('WebGL not available')

  const dpr = window.devicePixelRatio || 1
  const program = link(
    gl,
    compile(gl, gl.VERTEX_SHADER, vertexSource),
    compile(gl, gl.FRAGMENT_SHADER, fragmentSource),
  )
  const atlas = createAtlas(gl, chars, Math.round(fontSize * dpr), fontFamily)

  // fullscreen quad  (-1…1 clip space)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(program, 'a_position')
  const u = {}
  for (const name of ['u_time','u_resolution','u_gridSize','u_cellSize','u_atlas','u_charCount']) {
    u[name] = gl.getUniformLocation(program, name)
  }

  // one-time uniform setup
  gl.useProgram(program)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, atlas.tex)
  gl.uniform1i(u.u_atlas, 0)
  gl.uniform1f(u.u_charCount, chars.length)

  return {
    resize() {
      canvas.width  = canvas.clientWidth  * dpr
      canvas.height = canvas.clientHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)

      const cols = Math.floor(canvas.width  / atlas.charWidth)
      const rows = Math.floor(canvas.height / atlas.charHeight)

      gl.useProgram(program)
      gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u.u_gridSize, cols, rows)
      gl.uniform2f(u.u_cellSize, atlas.charWidth, atlas.charHeight)
    },

    draw(time) {
      gl.uniform1f(u.u_time, time)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
  }
}
