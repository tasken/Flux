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

function createAtlasCanvas(chars, fontSize, fontFamily, cellWidthUnits = 1, cellHeightUnits = 1) {
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

  const mRef = tctx.measureText('Mg|')
  const ascent = Math.ceil(mRef.fontBoundingBoxAscent ?? fontSize * 0.85)
  const safeCellWidthUnits = Math.max(1, cellWidthUnits)
  const safeCellHeightUnits = Math.max(1, cellHeightUnits)
  const charHeight = Math.max(1, Math.ceil(charWidth * safeCellHeightUnits / safeCellWidthUnits))

  const atlas = document.createElement('canvas')
  atlas.width = charWidth * chars.length
  atlas.height = charHeight
  const ctx = atlas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context not available for atlas rendering')

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * charWidth + charWidth * 0.5, ascent)
  }

  return { canvas: atlas, charWidth, charHeight }
}

const WGSL_SHADER = /* wgsl */ `
struct Uniforms {
  data0: vec4f,
  data1: vec4f,
  data2: vec4f,
  data3: vec4f,
  data4: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;
@group(0) @binding(3) var fluidTex: texture_2d<f32>;
@group(0) @binding(4) var fluidSampler: sampler;
@group(0) @binding(5) var wordTex: texture_2d<f32>;
@group(0) @binding(6) var wordSampler: sampler;
@group(0) @binding(7) var wordDepartTex: texture_2d<f32>;
@group(0) @binding(8) var wordDepartSampler: sampler;
@group(0) @binding(9) var overlayTex: texture_2d<f32>;
@group(0) @binding(10) var overlaySampler: sampler;

fn oklch2rgb(L: f32, C: f32, h: f32) -> vec3f {
  let a = C * cos(h);
  let b = C * sin(h);
  let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;
  var rgb = vec3f(
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
  );
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  return rgb;
}

fn procValue(uv: vec2f, t: f32) -> f32 {
  var px = uv.x;
  var py = uv.y;
  var ox: f32;
  var oy: f32;
  let PHI = 1.6180339887;
  let SQ2 = 1.4142135624;

  ox = px; oy = py;
  px += sin(oy * 1.7 + t * 0.40 * PHI) * 0.30;
  py += cos(ox * 1.7 + t * 0.40 * SQ2) * 0.30;

  ox = px; oy = py;
  px += sin(oy * 2.3 + t * 0.55 * SQ2) * 0.25;
  py += cos(ox * 2.3 + t * 0.55 * PHI) * 0.25;

  ox = px; oy = py;
  px += sin(oy * 2.9 + t * 0.70 * PHI) * 0.20;
  py += cos(ox * 2.9 + t * 0.70 * SQ2) * 0.20;

  let v1 = sin(px * 4.0 + t * PHI);
  let v2 = cos(py * 3.5 - t * SQ2);
  let v3 = sin((px + py) * 2.8 + t * 0.9 * PHI);
  let v4 = cos(length(vec2f(px, py)) * 5.0 - t * 1.7 * SQ2);
  let v5 = sin(px * 1.3 - py * 0.7 + t * 0.31 * PHI);
  return (v1 + v2 + v3 + v4 + v5) * 0.2;
}

fn toSceneUV(point: vec2f, gridSize: vec2f) -> vec2f {
  let gridPoint = point * gridSize;
  let m = min(gridSize.x, gridSize.y);
  return 2.0 * (gridPoint - gridSize * 0.5) / m;
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
  var positions = array<vec4f, 3>(
    vec4f(-1.0, -1.0, 0.0, 1.0),
    vec4f(3.0, -1.0, 0.0, 1.0),
    vec4f(-1.0, 3.0, 0.0, 1.0),
  );
  return positions[idx];
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let time = uniforms.data0.x;
  let resolution = vec2f(uniforms.data0.y, uniforms.data0.z);
  let gridSize = vec2f(uniforms.data1.x, uniforms.data1.y);
  let cellSize = vec2f(uniforms.data1.z, uniforms.data1.w);
  let pointer = vec2f(uniforms.data2.x, uniforms.data2.y);
  let pointerDelta = vec2f(uniforms.data2.z, uniforms.data2.w);
  let pointerActive = uniforms.data3.x;
  let pointerDown = uniforms.data3.y;
  let seed = uniforms.data3.z;
  let fieldTimeScale = uniforms.data3.w;
  let fieldAmplitude = uniforms.data4.x;
  let wordAspect = uniforms.data4.y;
  let densityCharCount = uniforms.data4.z;

  let fc = vec2f(pos.x, resolution.y - pos.y);
  let cell = floor(fc / cellSize);
  if (cell.x >= gridSize.x || cell.y >= gridSize.y) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let m = min(gridSize.x, gridSize.y);
  var uv = 2.0 * (cell - gridSize * 0.5) / m;

  let fluidUV = (cell + 0.5) / gridSize;
  let fluid = textureSampleLevel(fluidTex, fluidSampler, fluidUV, 0.0);
  let fDensity = fluid.r;
  let fVx = fluid.g;
  let fVy = fluid.b;
  let fSpeed = fluid.a;

  let t = time * fieldTimeScale + seed;
  let bgVal = procValue(uv, t) * fieldAmplitude;
  uv += vec2f(fVx, fVy) * 0.4;

  var value = bgVal + fDensity * 1.5;
  let pointerUV = toSceneUV(pointer, gridSize);
  let pointerFlow = vec2f(pointerDelta.x, -pointerDelta.y);
  let pointerDist = distance(uv, pointerUV);
  let pointerGlow = pointerActive * smoothstep(0.42, 0.0, pointerDist);
  let pointerBurst = pointerDown * smoothstep(0.22, 0.0, pointerDist);
  value += pointerGlow * 0.2 + pointerBurst * 0.3;
  value += dot(pointerFlow, uv - pointerUV) * pointerGlow * 0.6;
  value = clamp(value, -1.0, 1.0);
  var d = (value + 1.0) * 0.5;

  let aspect = (gridSize.x / gridSize.y) * wordAspect;
  var wuv: vec2f;
  if (aspect < 1.0) {
    wuv = vec2f(cell.x / gridSize.x, (cell.y / gridSize.y - 0.5) * aspect + 0.5);
  } else {
    wuv = vec2f((cell.x / gridSize.x - 0.5) / aspect + 0.5, cell.y / gridSize.y);
  }
  let warpAmt = 0.6 + 0.3 * cos(t * 0.7);
  wuv.x += warpAmt * (procValue(wuv * 3.0, t * 0.5) * 0.15);
  wuv.y += warpAmt * (procValue(wuv * 3.0 + 7.0, t * 0.5) * 0.15);
  let wordSample = textureSampleLevel(wordTex, wordSampler, clamp(wuv, vec2f(0.0), vec2f(1.0)), 0.0).r;
  let departWordSample = textureSampleLevel(wordDepartTex, wordDepartSampler, clamp(wuv, vec2f(0.0), vec2f(1.0)), 0.0).a;
  let wordBoost = max(wordSample, departWordSample);
  d = mix(d, max(d, 0.9), wordBoost);

  var charIdx = clamp(floor(d * densityCharCount), 0.0, densityCharCount - 1.0);
  let overlay = textureSampleLevel(overlayTex, overlaySampler, fluidUV, 0.0);
  if (overlay.a > 0.0) {
    charIdx = floor(overlay.r * 255.0 + 0.5);
    d = max(d, 0.82);
  }

  let localUV = fract(fc / cellSize);
  let atlasUV = vec2f((charIdx + localUV.x) / uniforms.data4.w, localUV.y);
  let glyph = textureSampleLevel(atlasTex, atlasSampler, atlasUV, 0.0);
  let alpha = glyph.a;

  let vorticity = fVy - fVx;
  let hueBase = t * 0.13 + vorticity * 1.2 + bgVal * 0.5 + pointerGlow * 0.3 + pointerBurst * 0.6;
  let coldHue = 4.3 + sin(hueBase) * 0.9;
  let warmHue = 0.6 + sin(hueBase) * 0.5;
  let hueRad = mix(coldHue, warmHue, pointerBurst);
  let wordLift = smoothstep(0.0, 0.85, max(wordSample, departWordSample));
  let chroma = 0.18 + abs(bgVal) * 0.10 + fSpeed * 0.14 + pointerGlow * 0.05 + pointerBurst * 0.06 + wordLift * 0.04;
  let lum = min(d * 0.88 + fSpeed * 0.15 + pointerGlow * 0.10 + pointerBurst * 0.14 + wordLift * 0.12, 0.95);
  let rgb = oklch2rgb(lum, chroma, hueRad);
  return vec4f(rgb * alpha, 1.0);
}
`

function createWebGPURenderer(canvas, opts) {
  const {
    fontSize,
    cellWidthUnits = 1,
    cellHeightUnits = 1,
    fontFamily,
    chars,
  } = opts
  let staticUniforms = opts.staticUniforms || {}
  if (!chars?.length) throw new Error('Renderer requires at least one character')

  const atlasCanvas = createAtlasCanvas(chars, Math.round(fontSize * (window.devicePixelRatio || 1)), fontFamily, cellWidthUnits, cellHeightUnits)
  const state = {
    context: null,
    device: null,
    queue: null,
    format: null,
    pipeline: null,
    bindGroupLayout: null,
    atlasTex: null,
    fluidTex: null,
    wordTex: null,
    wordDepartTex: null,
    overlayTex: null,
    bindGroup: null,
    uniformBuffer: null,
    samplerAtlas: null,
    samplerFluid: null,
    samplerWord: null,
    samplerWordDepart: null,
    samplerOverlay: null,
    cols: 1,
    rows: 1,
    charWidth: atlasCanvas.charWidth,
    charHeight: atlasCanvas.charHeight,
    seed: Math.random() * 1e5,
    pendingFluid: null,
    pendingWord: null,
    pendingWordDepart: null,
    pendingOverlay: null,
    initPromise: null,
    useFallback: false,
    fallbackRenderer: null,
  }

  const uniformData = new Float32Array(20)

  function applyStaticUniforms() {
    if (!state.device || !state.uniformBuffer) return
    const u = staticUniforms || {}
    uniformData[15] = Number(u.u_fieldTimeScale ?? 1)
    uniformData[16] = Number(u.u_fieldAmplitude ?? 1)
    uniformData[17] = Number(u.u_wordAspect ?? 1)
    uniformData[18] = Number(u.u_densityCharCount ?? chars.length)
    uniformData[19] = Number(chars.length)
    state.queue.writeBuffer(state.uniformBuffer, 0, uniformData.buffer, 0, uniformData.byteLength)
  }

  function ensureReady() {
    if (typeof navigator === 'undefined' || !navigator.gpu || state.device || state.initPromise || state.useFallback) return
    state.initPromise = (async () => {
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw new Error('WebGPU adapter not available')
      const device = await adapter.requestDevice()
      const context = canvas.getContext('webgpu')
      if (!context) throw new Error('WebGPU canvas context not available')
      const format = navigator.gpu.getPreferredCanvasFormat()
      state.device = device
      state.queue = device.queue
      state.context = context
      state.format = format

      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
      })

      state.atlasTex = device.createTexture({
        size: [atlasCanvas.canvas.width, atlasCanvas.canvas.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      state.samplerAtlas = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
      state.queue.copyExternalImageToTexture({ source: atlasCanvas.canvas }, { texture: state.atlasTex }, [atlasCanvas.canvas.width, atlasCanvas.canvas.height])

      state.wordTex = device.createTexture({
        size: [1024, 256, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      state.wordDepartTex = device.createTexture({
        size: [1024, 256, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      state.overlayTex = device.createTexture({
        size: [state.cols, state.rows, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      state.fluidTex = device.createTexture({
        size: [state.cols, state.rows, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })

      state.samplerFluid = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' })
      state.samplerWord = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
      state.samplerWordDepart = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
      state.samplerOverlay = device.createSampler({ minFilter: 'nearest', magFilter: 'nearest' })

      state.uniformBuffer = device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      state.bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '2d' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 10, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      })

      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [state.bindGroupLayout] })
      const module = device.createShaderModule({ code: WGSL_SHADER })
      state.pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
      })

      state.bindGroup = device.createBindGroup({
        layout: state.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: state.uniformBuffer } },
          { binding: 1, resource: state.atlasTex.createView() },
          { binding: 2, resource: state.samplerAtlas },
          { binding: 3, resource: state.fluidTex.createView() },
          { binding: 4, resource: state.samplerFluid },
          { binding: 5, resource: state.wordTex.createView() },
          { binding: 6, resource: state.samplerWord },
          { binding: 7, resource: state.wordDepartTex.createView() },
          { binding: 8, resource: state.samplerWordDepart },
          { binding: 9, resource: state.overlayTex.createView() },
          { binding: 10, resource: state.samplerOverlay },
        ],
      })

      applyStaticUniforms()
      if (state.pendingFluid) {
        state.queue.writeTexture({ texture: state.fluidTex }, state.pendingFluid, { bytesPerRow: state.cols * 4 * 4 }, { width: state.cols, height: state.rows })
        state.pendingFluid = null
      }
      if (state.pendingWord) {
        state.queue.copyExternalImageToTexture({ source: state.pendingWord }, { texture: state.wordTex }, [state.pendingWord.width, state.pendingWord.height])
        state.pendingWord = null
      }
      if (state.pendingWordDepart) {
        state.queue.copyExternalImageToTexture({ source: state.pendingWordDepart }, { texture: state.wordDepartTex }, [state.pendingWordDepart.width, state.pendingWordDepart.height])
        state.pendingWordDepart = null
      }
      if (state.pendingOverlay) {
        state.queue.writeTexture({ texture: state.overlayTex }, state.pendingOverlay, { bytesPerRow: state.cols * 4 }, { width: state.cols, height: state.rows })
        state.pendingOverlay = null
      }
    })().catch((error) => {
      state.useFallback = true
      state.initPromise = null
      state.fallbackRenderer = createGLRenderer(canvas, { ...opts, staticUniforms })
      console.warn('WebGPU initialization failed, falling back to WebGL', error)
    })
  }

  function syncFluidTexture(pixels, cols, rows) {
    if (!state.device || !state.fluidTex) return
    state.queue.writeTexture(
      { texture: state.fluidTex },
      pixels,
      { bytesPerRow: cols * 4 * 4 },
      { width: cols, height: rows },
    )
  }

  function syncOverlayTexture(pixels, cols, rows) {
    if (!state.device || !state.overlayTex) return
    state.queue.writeTexture(
      { texture: state.overlayTex },
      pixels,
      { bytesPerRow: cols * 4 },
      { width: cols, height: rows },
    )
  }

  function syncUniforms(time, width, height, cols, rows, pointer) {
    if (!state.device || !state.uniformBuffer) return
    const {
      x = 0.5,
      y = 0.5,
      dx = 0,
      dy = 0,
      active = 0,
      down = 0,
    } = pointer

    uniformData[0] = time
    uniformData[1] = width
    uniformData[2] = height
    uniformData[3] = 0

    uniformData[4] = cols
    uniformData[5] = rows
    uniformData[6] = state.charWidth
    uniformData[7] = state.charHeight

    uniformData[8] = x
    uniformData[9] = y
    uniformData[10] = dx
    uniformData[11] = dy

    uniformData[12] = active
    uniformData[13] = down
    uniformData[14] = state.seed
    uniformData[15] = Number(staticUniforms.u_fieldTimeScale ?? 1)
    uniformData[16] = Number(staticUniforms.u_fieldAmplitude ?? 1)
    uniformData[17] = Number(staticUniforms.u_wordAspect ?? 1)
    uniformData[18] = Number(staticUniforms.u_densityCharCount ?? chars.length)
    uniformData[19] = Number(chars.length)

    state.queue.writeBuffer(state.uniformBuffer, 0, uniformData.buffer, 0, uniformData.byteLength)
  }

  function resize() {
    if (state.useFallback && state.fallbackRenderer) {
      return state.fallbackRenderer.resize()
    }

    const nextDpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * nextDpr
    canvas.height = canvas.clientHeight * nextDpr

    if (state.context && state.device) {
      state.context.configure({ device: state.device, format: state.format, alphaMode: 'premultiplied' })
    }

    const cols = Math.max(1, Math.floor(canvas.width / state.charWidth))
    const rows = Math.max(1, Math.floor(canvas.height / state.charHeight))
    state.cols = cols
    state.rows = rows

    if (state.device) {
      if (state.fluidTex) {
        state.fluidTex.destroy()
      }
      state.fluidTex = state.device.createTexture({
        size: [cols, rows, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      if (state.overlayTex) {
        state.overlayTex.destroy()
      }
      state.overlayTex = state.device.createTexture({
        size: [cols, rows, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      if (state.bindGroup) {
        state.bindGroup = state.device.createBindGroup({
          layout: state.bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: state.uniformBuffer } },
            { binding: 1, resource: state.atlasTex.createView() },
            { binding: 2, resource: state.samplerAtlas },
            { binding: 3, resource: state.fluidTex.createView() },
            { binding: 4, resource: state.samplerFluid },
            { binding: 5, resource: state.wordTex.createView() },
            { binding: 6, resource: state.samplerWord },
            { binding: 7, resource: state.wordDepartTex.createView() },
            { binding: 8, resource: state.samplerWordDepart },
            { binding: 9, resource: state.overlayTex.createView() },
            { binding: 10, resource: state.samplerOverlay },
          ],
        })
      }
    }

    return { cols, rows }
  }

  function draw(time, pointer = {}) {
    if (state.useFallback && state.fallbackRenderer) {
      return state.fallbackRenderer.draw(time, pointer)
    }
    if (!state.device || !state.pipeline || !state.bindGroup || !state.context) {
      ensureReady()
      return
    }

    syncUniforms(time, canvas.width, canvas.height, state.cols, state.rows, pointer)
    const encoder = state.device.createCommandEncoder()
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: state.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        storeOp: 'store',
      }],
    })
    renderPass.setPipeline(state.pipeline)
    renderPass.setBindGroup(0, state.bindGroup)
    renderPass.draw(3)
    renderPass.end()
    state.queue.submit([encoder.finish()])
  }

  function useFallbackRenderer() {
    if (!state.fallbackRenderer) {
      state.fallbackRenderer = createGLRenderer(canvas, { ...opts, staticUniforms })
    }
    return state.fallbackRenderer
  }

  return {
    get engine() {
      return state.useFallback ? 'WebGL' : 'WebGPU'
    },
    resize() {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.resize()
      return resize()
    },
    draw(time, pointer = {}) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.draw(time, pointer)
      return draw(time, pointer)
    },
    recompile(_newVertexSource, _newFragmentSource, newStaticUniforms) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.recompile(_newVertexSource, _newFragmentSource, newStaticUniforms)
      if (newStaticUniforms) staticUniforms = newStaticUniforms
      applyStaticUniforms()
      this.resize()
    },
    uploadFluid(pixels, cols, rows) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.uploadFluid(pixels, cols, rows)
      if (!state.device) {
        state.pendingFluid = pixels
        return
      }
      if (cols !== state.cols || rows !== state.rows) {
        state.cols = cols
        state.rows = rows
      }
      syncFluidTexture(pixels, cols, rows)
    },
    uploadWordTexture(canvasSource) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.uploadWordTexture(canvasSource)
      if (!state.device) {
        state.pendingWord = canvasSource
        return
      }
      state.queue.copyExternalImageToTexture({ source: canvasSource }, { texture: state.wordTex }, [canvasSource.width, canvasSource.height])
    },
    uploadDepartWordTexture(canvasSource) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.uploadDepartWordTexture(canvasSource)
      if (!state.device) {
        state.pendingWordDepart = canvasSource
        return
      }
      state.queue.copyExternalImageToTexture({ source: canvasSource }, { texture: state.wordDepartTex }, [canvasSource.width, canvasSource.height])
    },
    uploadOverlay(pixels, cols, rows) {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.uploadOverlay(pixels, cols, rows)
      if (!state.device) {
        state.pendingOverlay = pixels
        return
      }
      syncOverlayTexture(pixels, cols, rows)
    },
    dispose() {
      if (state.useFallback && state.fallbackRenderer) return state.fallbackRenderer.dispose()
      if (state.device) {
        state.atlasTex.destroy()
        state.fluidTex.destroy()
        state.wordTex.destroy()
        state.wordDepartTex.destroy()
        state.overlayTex.destroy()
      }
    },
  }
}

function createGLRenderer(canvas, opts) {
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

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
  if (!gl) throw new Error('WebGL not available')

  let program = link(
    gl,
    compile(gl, gl.VERTEX_SHADER, vertexSource),
    compile(gl, gl.FRAGMENT_SHADER, fragmentSource),
  )
  let dpr = window.devicePixelRatio || 1
  let atlas = createAtlas(gl, chars, Math.round(fontSize * dpr), fontFamily, cellWidthUnits, cellHeightUnits)

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

  let fluidTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, fluidTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null)

  function bindFluid() {
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, fluidTex)
    gl.uniform1i(u.u_fluid, 1)
  }

  let wordTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, wordTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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

  const seed = Math.random() * 1e5
  gl.useProgram(program)
  gl.uniform1f(u.u_seed, seed)
  applyStaticUniforms()

  let fluidCols = 1
  let fluidRows = 1

  return {
    engine: 'WebGL',
    resize() {
      const nextDpr = window.devicePixelRatio || 1
      if (nextDpr !== dpr) {
        dpr = nextDpr
        gl.deleteTexture(atlas.tex)
        atlas = createAtlas(gl, chars, Math.round(fontSize * dpr), fontFamily, cellWidthUnits, cellHeightUnits)
        bindAtlas()
      }

      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)

      const cols = Math.max(1, Math.floor(canvas.width / atlas.charWidth))
      const rows = Math.max(1, Math.floor(canvas.height / atlas.charHeight))

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
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, pixels)
    },

    uploadWordTexture(canvasSource) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, wordTex)
      if (canvasSource.width > 0 && canvasSource.height > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvasSource)
      }
    },

    uploadDepartWordTexture(canvasSource) {
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, wordDepartTex)
      if (canvasSource.width > 0 && canvasSource.height > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvasSource)
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

export function createRenderer(canvas, opts) {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      return createWebGPURenderer(canvas, opts)
    } catch (error) {
      console.warn('WebGPU renderer initialization failed, falling back to WebGL.', error)
    }
  }

  return createGLRenderer(canvas, opts)
}
