// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  sketch.js — the creative part.                                            │
// │  Edit the fragment shader below to change the visual.                      │
// │  Vite HMR will reload the browser on save.                                 │
// └─────────────────────────────────────────────────────────────────────────────┘

import {
  fontSize, fontFamily, chars, densityChars,
  fieldTimeScale, fieldAmplitude,
  wordCanvasW, wordCanvasH,
} from './settings.js'

export const config = { fontSize, fontFamily, chars }

// Emit GLSL float literals — ensures e.g. 3 becomes "3.0" not "3"
const g = (v) => Number(v).toFixed(4)

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
uniform float     u_charCount;   // number of characters in atlas (total)
uniform vec2      u_pointer;     // normalized pointer position, top-left origin
uniform vec2      u_pointerDelta;
uniform float     u_pointerActive;
uniform float     u_pointerDown;
uniform sampler2D u_fluid;        // CPU fluid sim: R=density, G=vx, B=vy, A=speed
uniform float     u_seed;          // random offset so each page load is unique
uniform sampler2D u_wordTex;       // word bitmap (small canvas, scaled to fill screen)

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

  // Golden ratio & sqrt(2) give irrational frequency ratios → the combined
  // waveform never exactly repeats (incommensurate periods).
  const float PHI = 1.6180339887;
  const float SQ2 = 1.4142135624;

  // Domain warp — three passes with irrational time multipliers
  ox = px; oy = py;
  px += sin(oy * 1.7 + t * 0.40 * PHI) * 0.30;
  py += cos(ox * 1.7 + t * 0.40 * SQ2) * 0.30;

  ox = px; oy = py;
  px += sin(oy * 2.3 + t * 0.55 * SQ2) * 0.25;
  py += cos(ox * 2.3 + t * 0.55 * PHI) * 0.25;

  ox = px; oy = py;
  px += sin(oy * 2.9 + t * 0.70 * PHI) * 0.20;
  py += cos(ox * 2.9 + t * 0.70 * SQ2) * 0.20;

  // Wave interference — 5 layers with mutually irrational speeds.
  float v1 = sin(px * 4.0 + t * PHI);
  float v2 = cos(py * 3.5 - t * SQ2);
  float v3 = sin((px + py) * 2.8 + t * 0.9 * PHI);
  float v4 = cos(length(vec2(px, py)) * 5.0 - t * 1.7 * SQ2);
  float v5 = sin(px * 1.3 - py * 0.7 + t * 0.31 * PHI); // slow cross-axis drift

  return (v1 + v2 + v3 + v4 + v5) * 0.2;
}

vec2 toSceneUV(vec2 point) {
  // pointer is [0,1] over the canvas; map directly to cell coords then to
  // the same centered space the main loop uses for uv.
  vec2 gridPoint = point * u_gridSize;                 // cell coords [0, gridSize]
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
  float t     = u_time * ${g(fieldTimeScale)} + u_seed;
  float bgVal = procValue(uv, t) * ${g(fieldAmplitude)};          // bold ambient backdrop

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
  value += dot(pointerFlow, uv - pointerUV) * pointerGlow * 0.6;

  value = clamp(value, -1.0, 1.0);
  float d = (value + 1.0) * 0.5;                  // [0, 1]

  // ── Giant background letters (ertdfgcvb-style) ──
  // Scale the word bitmap to fill the whole grid and warp it with noise.
  // The bitmap's brightness drives the background density → huge letters
  // emerge from the character field.
  float aspect = (u_gridSize.x / u_gridSize.y)
               * (${g(wordCanvasH)} / ${g(wordCanvasW)});  // grid aspect / tex aspect
  vec2 wuv;
  if (aspect < 1.0) {
    // Grid is taller than texture — fit to width
    wuv = vec2(cell.x / u_gridSize.x,
               (cell.y / u_gridSize.y - 0.5) * aspect + 0.5);
  } else {
    // Grid is wider than texture — fit to height
    wuv = vec2((cell.x / u_gridSize.x - 0.5) / aspect + 0.5,
               cell.y / u_gridSize.y);
  }
  // Noise warp for organic distortion
  float warpAmt = 0.6 + 0.3 * cos(t * 0.7);
  wuv.x += warpAmt * (procValue(wuv * 3.0, t * 0.5) * 0.15);
  wuv.y += warpAmt * (procValue(wuv * 3.0 + 7.0, t * 0.5) * 0.15);

  float wordSample = texture2D(u_wordTex, clamp(wuv, 0.0, 1.0)).r;
  // Blend word shape into density
  d = mix(d, max(d, 0.9), wordSample);

  // Map density → character index (using density chars)
  float charIdx = clamp(floor(d * ${g(densityChars.length)}), 0.0, ${g(densityChars.length - 1)});

  // Local UV within this cell → sample the font atlas
  vec2 localUV = fract(fc / u_cellSize);
  vec2 atlasUV = vec2((charIdx + localUV.x) / u_charCount, localUV.y);
  float alpha  = texture2D(u_atlas, atlasUV).a;

  // ── Color: OKLch driven by fluid velocity + density ──
  // Cold palette: hue locked to blue → cyan → purple range (~3.4 – 5.2 rad)
  // Shifts warm (orange/red) on click for tactile feedback
  float vorticity = fVy - fVx;
  float hueBase   = t * 0.13 + vorticity * 1.2 + bgVal * 0.5
                    + pointerGlow * 0.3 + pointerBurst * 0.6;

  float coldHue   = 4.3 + sin(hueBase) * 0.9;
  float warmHue   = 0.6 + sin(hueBase) * 0.5;
  float hueRad    = mix(coldHue, warmHue, pointerBurst);

  float chroma    = 0.18 + abs(bgVal) * 0.10 + fSpeed * 0.14
                    + pointerGlow * 0.05 + pointerBurst * 0.06;
  float Lum       = min(d * 0.88 + fSpeed * 0.15
                        + pointerGlow * 0.10 + pointerBurst * 0.14, 0.95);

  vec3  rgb       = oklch2rgb(Lum, chroma, hueRad);

  gl_FragColor = vec4(rgb * alpha, 1.0);
}
`
