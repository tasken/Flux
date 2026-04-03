# webart — Design Spec

**Date:** 2026-04-03  
**Status:** Current

---

## Overview

A personal creative playground for generative, interactive text-mode art rendered as a character grid. The live app is a hybrid CPU+GPU renderer: a CPU-side Navier-Stokes fluid simulation feeds density and velocity data into a WebGL fragment shader, which generates the motion field, samples a font atlas to render glyphs, and applies OKLch perceptual color. Pointer input injects forces into the fluid sim and adds instant visual glow in the shader. A secondary "words" mode overlays split-flap animated text through the same warped field. The user edits a single sketch file locally; the browser reloads instantly via Vite HMR.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | WebGL + Canvas font atlas + CPU fluid sim | GPU character-grid rendering with real fluid dynamics |
| Color | OKLch (Björn Ottosson, 2020) | Perceptually uniform: equal L steps look equally bright regardless of hue |
| Dev server | Vite | Instant HMR — sketch file changes reflect without page reload |
| Language | Vanilla JS (ES modules) | No framework overhead; browser-native modules |
| Deploy | GitHub Pages via GitHub Actions | Automatic deploy on push to main |

---

## Project Structure

```
webArt/
├── index.html              ← fullscreen canvas, imports main.js
├── src/
│   ├── main.js             ← entry: boot, pointer state, animation loop
│   ├── renderer.js         ← WebGL program, font atlas, fluid/word textures, resize/draw/dispose
│   ├── sketch.js           ← GLSL shader sources, visual config, OKLch color
│   ├── simulation.js       ← wraps CPU solver into frame-steppable sim with RGBA packing
│   ├── fluid.js            ← pure Navier-Stokes solver (addSource, diffuse, advect, project)
│   └── words.js            ← split-flap lyric cycler (word emergence)
├── design.md               ← this file
├── future.md               ← future improvements roadmap
├── .github/
│   ├── workflows/deploy.yml← GitHub Pages deploy workflow
│   └── instructions/       ← Copilot instruction files
├── vite.config.js          ← dev server config (host: true)
└── package.json            ← deps: vite (dev)
```

---

## Architecture

The app is split into five runtime modules:

### `main.js`
Entry point. Loads fonts, creates the renderer and word cycler, manages the animation loop, tracks pointer position and velocity, injects forces into the fluid simulation, and handles cleanup during hot-module replacement. Supports keyboard mode switching between procedural (key 1) and words (key 2) modes.

### `renderer.js`
Compiles the shader program, builds a single-row glyph atlas (measuring max width across all characters), manages three GPU textures (font atlas on unit 0, fluid data on unit 1, word bitmap on unit 2), keeps the canvas sized to device pixels, and pushes runtime uniforms into WebGL on each frame. Exposes `recompile()` for shader-only HMR, `uploadFluid()` for CPU→GPU fluid transfer, `uploadWordTexture()` for word bitmap upload, and `setMode()` for switching render modes. A random `u_seed` uniform is set once per session so each page load looks different.

### `sketch.js`
Contains the editable art logic: the vertex shader, the fragment shader, and the character/font configuration. The fragment shader generates the animated value field using domain warping with irrational frequency ratios (φ, √2), samples the CPU fluid texture for organic distortion, converts values to glyph lookups, and shades with OKLch perceptual color. In words mode, it samples the word bitmap through the same warped UV space.

### `simulation.js`
Wraps the CPU Navier-Stokes solver into a frame-steppable simulation. Maintains density and velocity fields as Float32Arrays, exposes `injectForce()` for pointer interaction, `step()` for advancing the simulation, and packs results into an RGBA Uint8Array (`pixels`) for GPU texture upload.

### `words.js`
Split-flap word cycler that animates through a curated word list. Renders white text on a small off-screen canvas, with characters cycling through the alphabet toward their target — staggered per position like an airport departure board. Returns the canvas for GPU texture upload each frame.

### Runtime Flow

1. `document.fonts.ready` resolves in `main.js`
2. `createRenderer()` builds the WebGL program, glyph atlas, and fluid/word textures
3. `createWordCycler()` prepares the split-flap animation canvas
4. On resize, `renderer.resize()` returns `{ cols, rows }` for simulation sizing
5. Each frame:
   - Pointer forces are injected into the fluid sim via `sim.injectForce()`
   - `sim.step()` advances the Navier-Stokes solver
   - `renderer.uploadFluid()` sends packed RGBA pixels to the GPU
   - In words mode, `wordCycler.update()` advances the flap animation
   - `renderer.draw()` sends time, pointer state, and uniforms to the shader
   - The fragment shader samples the fluid texture, warps coordinates, picks characters, and applies OKLch color

---

## Shader Behavior

The fragment shader combines stateless procedural animation with live fluid simulation data:

1. **Fluid sampling** reads density, velocity, and speed from the CPU simulation texture
2. **Procedural background** uses domain warping (3 passes) and wave interference (5 layers) with irrational frequency ratios (φ, √2) to produce non-repeating ambient motion
3. **UV warping** displaces coordinates by fluid velocity for organic distortion
4. **Pointer influence** adds glow/burst terms near the cursor for instant visual feedback
5. **Words mode** samples a word bitmap texture through the warped UV space
6. **Glyph lookup** converts the combined scalar value into a character index in the atlas
7. **OKLch color** maps vorticity, speed, and density to a cold palette (blue→cyan→purple, ~3.4–5.2 rad) that shifts warm (orange/red) on click

The `u_seed` uniform offsets time by a random amount per session, ensuring each page load starts with a different visual state.

---

## Character Rendering

The configured character ramp is:

```text
 .·:;-=+*abcXYZ#@W
```

The renderer measures the maximum glyph width across all characters, creates a one-row atlas canvas, uploads it as a texture, and samples it in the fragment shader using per-cell UVs. Different fonts or ramps change the entire feel of the piece.

---

## Color System

Colors use the OKLch perceptual color space (Björn Ottosson's OKLab, 2020). The pipeline:

1. Vorticity (fVy − fVx), background value, and pointer interaction drive a hue base
2. Cold palette clamps hue to ~3.4–5.2 rad (blue/cyan/purple)
3. Click burst blends toward a warm hue (~0.6 rad, orange/red) for tactile feedback
4. Chroma is driven by background amplitude, fluid speed, and pointer proximity
5. Luminance tracks the combined density/procedural value, capped at 0.95

---

## Interaction

- **Pointer move** — injects directional forces into the fluid sim + adds shader glow
- **Pointer down** — amplifies force injection and triggers warm color burst
- **Pointer leave / idle** — forces decay; fluid drains via per-frame velocity/density decay
- **Key 1** — procedural mode (default)
- **Key 2** — words mode (split-flap animated text)

---

## Dev Workflow

```bash
npm install
npm run dev        # Vite starts with HMR
# edit src/sketch.js → shader recompiles instantly (no page reload)
npm run build      # production bundle
```

The `import.meta.hot.dispose()` cleanup in `main.js` removes listeners, cancels the animation frame, and tears down GPU resources before the next module instance takes over. Shader-only edits trigger `recompile()` instead of a full page reload.

---

## Deployment

GitHub Pages deployment is automated via `.github/workflows/deploy.yml`. On push to `main`, the workflow installs dependencies, builds with `--base=/webArt/`, and deploys the dist folder.

---

## Out of Scope (Current)

- Multiple sketches / gallery
- Full simulation-state persistence on the GPU (see `future.md`)
- Per-character size, rotation, opacity
- Saving/sharing sketches
- Mobile-specific interaction design
- Parameter UI / dat.gui
