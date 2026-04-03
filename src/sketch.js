// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  sketch.js — the creative part.                                            │
// │  Edit the fragment shader below to change the visual.                      │
// │  Vite HMR will reload the browser on save.                                 │
// └─────────────────────────────────────────────────────────────────────────────┘

export const config = {
  fontSize:   12,
  fontFamily: "'IBM Plex Mono', monospace",
  chars:      ' ·.-~:+ca01OX#@',
}

// ── vertex shader (trivial fullscreen quad) ───────────────────────────────────

export const vertexSource = /* glsl */ `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// ── fragment shader (all the art happens here) ────────────────────────────────

export const fragmentSource = /* glsl */ `
precision highp float;

uniform float     u_time;       // milliseconds since page load
uniform vec2      u_resolution; // canvas size in device pixels
uniform vec2      u_gridSize;   // columns, rows
uniform vec2      u_cellSize;   // cell size in device pixels
uniform sampler2D u_atlas;       // font texture atlas
uniform float     u_charCount;   // number of characters in atlas
uniform vec2      u_pointer;     // normalized pointer position, top-left origin
uniform vec2      u_pointerDelta;
uniform float     u_pointerActive;
uniform float     u_pointerDown;
uniform sampler2D u_fluid;        // CPU fluid sim: R=density, G=vx, B=vy, A=speed

// ── OKLab / OKLch → linear RGB ────────────────────────────────────────────────
// Perceptually uniform: equal L steps look equally bright regardless of hue.
// Based on Björn Ottosson's OKLab (2020).

vec3 oklch2rgb(float L, float C, float h) {
  // OKLch → OKLab
  float a = C * cos(h);
  float b = C * sin(h);

  // OKLab → approximate linear sRGB via the LMS cube-root transform
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  float l3 = l_ * l_ * l_;
  float m3 = m_ * m_ * m_;
  float s3 = s_ * s_ * s_;

  vec3 rgb = vec3(
    +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
  );
  return clamp(rgb, 0.0, 1.0);
}

// ── procedural value ──────────────────────────────────────────────────────────
// Stateless: f(position, time) → scalar.  No state, no equilibrium, no staling.
// Unrolled domain-warp loop to help GPU compilers optimise.

float procValue(vec2 uv, float t) {
  float px = uv.x, py = uv.y;
  float ox, oy;

  // Pass 0: s=1.7, r=0.30, ti=t*0.40
  ox = px; oy = py;
  px += sin(oy * 1.7 + t * 0.40) * 0.30;
  py += cos(ox * 1.7 + t * 0.52) * 0.30;

  // Pass 1: s=2.3, r=0.25, ti=t*0.55
  ox = px; oy = py;
  px += sin(oy * 2.3 + t * 0.55) * 0.25;
  py += cos(ox * 2.3 + t * 0.715) * 0.25;

  // Pass 2: s=2.9, r=0.20, ti=t*0.70
  ox = px; oy = py;
  px += sin(oy * 2.9 + t * 0.70) * 0.20;
  py += cos(ox * 2.9 + t * 0.91) * 0.20;

  // Wave interference — 4 layers at different orientations and speeds.
  float v1 = sin(px * 4.0 + t * 1.4);
  float v2 = cos(py * 3.5 - t * 1.1);
  float v3 = sin((px + py) * 2.8 + t * 0.9);
  float v4 = cos(length(vec2(px, py)) * 5.0 - t * 2.0);

  return (v1 + v2 + v3 + v4) * 0.25;
}

vec2 toSceneUV(vec2 point) {
  vec2 gridPoint = point * u_gridSize;
  float m = min(u_gridSize.x, u_gridSize.y);
  return 2.0 * (gridPoint - u_gridSize * 0.5) / m;
}

// ── main ──────────────────────────────────────────────────────────────────────

void main() {
  // Flip Y so row 0 is at the top (terminal convention)
  vec2 fc = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);

  // Which grid cell does this fragment belong to?
  vec2 cell = floor(fc / u_cellSize);

  // Fragments outside the character grid → black
  if (cell.x >= u_gridSize.x || cell.y >= u_gridSize.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Normalize cell position to centered [-1, 1] space
  float m  = min(u_gridSize.x, u_gridSize.y);
  vec2  uv = 2.0 * (cell - u_gridSize * 0.5) / m;

  // ── Sample CPU fluid simulation texture ──
  vec2 fluidUV = (cell + 0.5) / u_gridSize;
  vec4 fluid   = texture2D(u_fluid, fluidUV);
  float fDensity = fluid.r;                      // [0, 1]
  float fVx      = fluid.g * 2.0 - 1.0;          // [-1, 1]
  float fVy      = fluid.b * 2.0 - 1.0;          // [-1, 1]
  float fSpeed   = fluid.a;                       // [0, 1]

  // ── Procedural background (gentle ambient motion) ──
  float t     = u_time * 0.0006;
  float bgVal = procValue(uv, t) * 0.25;          // subtle background

  // ── Warp UV by fluid velocity for organic distortion ──
  uv += vec2(fVx, fVy) * 0.4;

  // ── Combine: fluid density dominates, procedural adds ambient life ──
  float value = bgVal + fDensity * 1.5;

  // Pointer glow on top (instant visual feedback even without fluid)
  vec2 pointerUV = toSceneUV(u_pointer);
  vec2 pointerFlow = vec2(u_pointerDelta.x, -u_pointerDelta.y);
  float pointerDist = distance(uv, pointerUV);
  float pointerGlow = u_pointerActive * smoothstep(0.42, 0.0, pointerDist);
  float pointerBurst = u_pointerDown * smoothstep(0.22, 0.0, pointerDist);
  value += pointerGlow * 0.2 + pointerBurst * 0.3;

  value = clamp(value, -1.0, 1.0);
  float d = (value + 1.0) * 0.5;                  // [0, 1]

  // Map value → character index in the atlas
  float charIdx = clamp(floor(d * u_charCount), 0.0, u_charCount - 1.0);

  // Local UV within this cell → sample the font atlas
  vec2 localUV = fract(fc / u_cellSize);
  vec2 atlasUV = vec2((charIdx + localUV.x) / u_charCount, localUV.y);
  float alpha  = texture2D(u_atlas, atlasUV).a;

  // ── Color: OKLch driven by fluid velocity + density ──
  // Hue rotates with vorticity (fVy - fVx), base cool-blue
  float vorticity = fVy - fVx;
  float hueRad    = mod(3.6652 + vorticity * 1.2 + pointerGlow * 0.3 + pointerBurst * 0.6, 6.2832);
  float chroma    = 0.08 + fSpeed * 0.08 + pointerGlow * 0.02 + pointerBurst * 0.03;
  float Lum       = min(d * 0.65 + fSpeed * 0.1 + pointerGlow * 0.08 + pointerBurst * 0.12, 0.92);
  vec3  rgb       = oklch2rgb(Lum, chroma, hueRad);

  // Character pixels are colored; background is black
  gl_FragColor = vec4(rgb * alpha, 1.0);
}
`
