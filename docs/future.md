# Future Improvements

Ideas and directions for evolving the project. Roughly ordered by impact vs effort.

---

## High Impact / Low Effort

### Ambient curl-noise stirring
Derive a 2D curl field from the existing `procValue` function (finite-difference partial
derivatives) and inject it as a gentle, ever-present force into the fluid simulation.
This keeps the canvas alive with slow organic swirls even when there is no pointer input.

### FBM layering of procValue
Call `procValue` at 2×, 4× scale with halved amplitude to get multi-octave fractal
richness (formal FBM). The current 5-wave approach is hand-tuned FBM; a loop would
make it easier to tweak octave count, lacunarity, and gain.

### Ambient density injection
Inject low-level density into random sparse cells each frame so the fluid field always
has something to advect and diffuse, preventing the canvas from going fully dark at rest.

---

## High Impact / Medium Effort

### Feedback / frame history (ping-pong FBO)
Render to a framebuffer instead of the screen, then sample the previous frame in the
next pass. This enables motion trails, soft bloom, and temporal blending. Requires two
FBOs and a blit step — moderate GL infrastructure increase.

### Touch / multi-touch interaction
Track multiple simultaneous touch points and inject forces for each. Would make the
piece much more engaging on tablets and phones. Requires refactoring the single-pointer
model into a pointer-map with per-ID tracking.

### Per-character variation
Allow the shader to modulate character size, rotation, or opacity per cell based on
local field values. Would need a second atlas pass or SDF-based glyph rendering.

---

## Medium Impact / Low Effort

### Adjustable simulation parameters
Expose diffusion, viscosity, timestep, and decay as URL query params or a small dat.gui
panel so visitors can tune the sim live.

### Dark / light mode toggle
Invert the background and character color scheme. The OKLch pipeline makes this
straightforward — flip luminance and adjust chroma floor.

### Screenshot / GIF export
Add a key binding to capture the current frame (canvas `toBlob`) or record a short
sequence using the existing `requestAnimationFrame` loop and assemble via a worker.

---

## Lower Priority / Higher Effort

### GPU-only simulation (compute shader or transform feedback)
Move the Navier-Stokes solver to the GPU entirely. WebGL 2 transform feedback or
WebGPU compute shaders could eliminate the CPU→GPU texture upload bottleneck. Major
rewrite but would scale to much larger grids.

### Multiple sketch gallery
Support switching between different shader presets or user-saved sketches. Needs a
routing layer, sketch metadata, and a selection UI.

### Perlin / Simplex noise texture
Pre-generate a noise texture and sample it in the shader for a different procedural
flavor. Low visual difference from the current domain-warp approach but would provide
a useful building block for other effects (terrain, clouds).

### Saving / sharing sketches
Serialize shader source + config into a URL hash or shareable link. Requires careful
sanitization of user-supplied GLSL to prevent shader bombs.
