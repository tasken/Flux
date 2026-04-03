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
uniform vec2      u_resolution;  // canvas size in device pixels
uniform vec2      u_gridSize;    // columns, rows
uniform vec2      u_cellSize;    // cell size in device pixels
uniform sampler2D u_atlas;       // font texture atlas
uniform float     u_charCount;   // number of characters in atlas

// ── HSL → RGB ─────────────────────────────────────────────────────────────────
vec3 hsl2rgb(float h, float s, float l) {
  float c  = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h * 6.0;
  float x  = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb;
  if      (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else                rgb = vec3(c, 0.0, x);
  return rgb + l - c * 0.5;
}

// ── procedural value ──────────────────────────────────────────────────────────
// Stateless: f(position, time) → scalar.  No state, no equilibrium, no staling.

float procValue(vec2 uv, float t) {
  float px = uv.x, py = uv.y;

  // Domain warping — 3 passes of coordinate distortion.
  // Turns simple sine waves into organic, fluid-like blobs.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float s  = 1.7 + fi * 0.6;
    float r  = 0.3 - fi * 0.05;
    float ti = t * (0.4 + fi * 0.15);
    float ox = px, oy = py;
    px += sin(oy * s + ti) * r;
    py += cos(ox * s + ti * 1.3) * r;
  }

  // Wave interference — 4 layers at different orientations and speeds.
  float v1 = sin(px * 4.0 + t * 1.4);                           // horizontal
  float v2 = cos(py * 3.5 - t * 1.1);                           // vertical
  float v3 = sin((px + py) * 2.8 + t * 0.9);                    // diagonal
  float v4 = cos(length(vec2(px, py)) * 5.0 - t * 2.0);         // radial

  return (v1 + v2 + v3 + v4) * 0.25;                             // [-1, 1]
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

  // Procedural value
  float t     = u_time * 0.0006;
  float value = procValue(uv, t);          // [-1, 1]
  float d     = (value + 1.0) * 0.5;       // [ 0, 1]

  // Map value → character index in the atlas
  float charIdx = clamp(floor(d * u_charCount), 0.0, u_charCount - 1.0);

  // Local UV within this cell → sample the font atlas
  vec2 localUV = fract(fc / u_cellSize);
  vec2 atlasUV = vec2((charIdx + localUV.x) / u_charCount, localUV.y);
  float alpha  = texture2D(u_atlas, atlasUV).a;

  // Color: cool blue (210°) base, ±45° shifted by wave interference
  float hue       = mod(210.0 + value * 45.0, 360.0) / 360.0;
  float lightness = d * 0.6;
  vec3  rgb       = hsl2rgb(hue, 0.55, lightness);

  // Character pixels are colored; background is black
  gl_FragColor = vec4(rgb * alpha, 1.0);
}
`
