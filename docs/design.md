# webart — Design Spec

**Date:** 2026-04-02  
**Status:** Current

---

## Overview

A personal creative playground for generative, interactive text-mode art rendered as a character grid. The live app is a small WebGL renderer: a fragment shader generates the motion field, a font atlas turns the field into glyphs, and pointer input perturbs the field in real time. The user edits a single sketch file locally; the browser reloads instantly via Vite HMR.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | WebGL + Canvas font atlas | GPU-friendly character grid rendering with minimal runtime code |
| Dev server | Vite | Instant HMR — sketch file changes reflect without page reload |
| Language | Vanilla JS (ES modules) | No framework overhead; ABC is module-native |

---

## Project Structure

```
~/webArt/
├── index.html           ← fullscreen canvas, imports main.js
├── src/
│   ├── main.js          ← entry: pointer state, animation loop, lifecycle cleanup
│   ├── renderer.js      ← WebGL program setup, font atlas, resize/draw/dispose
│   ├── sketch.js        ← shader sources and high-level visual config
│   ├── fluid.js         ← experimental Navier-Stokes solver (not wired into runtime)
│   ├── map.js           ← experimental visual mapping helpers (not wired into runtime)
│   ├── fluid.test.js    ← solver unit tests
│   └── map.test.js      ← visual mapping unit tests
├── docs/
│   └── design.md        ← this file
├── vite.config.js       ← dev server config (host, port, optimizeDeps)
└── package.json         ← deps: vite (dev); vitest (test)
```

---

## Architecture

The app is split into three runtime pieces:

### `main.js`
Creates the renderer after fonts load, manages the animation loop, tracks pointer position and velocity, and handles cleanup during hot-module replacement.

### `renderer.js`
Compiles the shader program, builds a single-row glyph atlas from the configured character ramp, keeps the canvas sized to device pixels, and pushes runtime uniforms into WebGL on each frame.

### `sketch.js`
Contains the editable art logic: the vertex shader, the fragment shader, and the high-level character/font configuration. The fragment shader generates the animated value field, converts it to a glyph lookup, and shades the final result.

The runtime flow is:

1. `document.fonts.ready` resolves in `main.js`
2. `createRenderer()` builds the WebGL program and glyph atlas
3. Pointer events update normalized cursor position plus motion delta
4. `draw()` sends time, grid size, pointer state, and atlas metadata to the shader
5. The fragment shader turns each cell into a character sample and final color

---

## Shader Behavior

The fragment shader uses a stateless procedural field rather than a persistent simulation buffer:

1. **Domain warping** distorts coordinates through multiple sin/cos passes
2. **Wave interference** blends horizontal, vertical, diagonal, and radial components
3. **Pointer influence** bends coordinates using cursor motion and adds a glow/burst term near the pointer
4. **Glyph lookup** converts the final scalar value into an index within the atlas texture
5. **Shading** maps the value to hue, saturation, and lightness before masking through the glyph alpha

This keeps the piece lightweight and responsive while still feeling fluid-like.

## Character Rendering

The configured character ramp is:

```text
 ·.-~:+ca01OX#@
```

The renderer measures the active font, creates a one-row atlas canvas, uploads that canvas as a texture, and samples it in the fragment shader using per-cell UVs.

This means:

- the art remains editable as text characters instead of bitmap sprites
- different fonts or ramps can change the entire feel of the piece
- the GPU still does the heavy lifting once the atlas exists

---

## Interaction

- **Pointer move** — updates a normalized cursor position and motion vector
- **Pointer down** — increases the intensity of the local burst around the cursor
- **Pointer leave / idle** — fades interaction back out so the field returns to ambient motion

---

## Dev Workflow

```bash
cd ~/webArt
npm install
npm run dev        # Vite starts, opens browser
# edit src/sketch.js → browser reflects changes instantly (no page reload)
```

The `import.meta.hot.dispose()` cleanup in `main.js` removes listeners, cancels the animation frame, and tears down GPU resources before the next module instance takes over.

---

## Experimental Modules

`src/fluid.js` and `src/map.js` are retained as tested experiments from an earlier fluid-solver direction. They are not wired into the current WebGL runtime, but they remain useful reference code if the project returns to a persistent simulation approach later.

---

## Out of Scope (Current)

- Multiple sketches / gallery
- Full simulation-state persistence on the GPU
- Per-character size, rotation, opacity
- Saving/sharing sketches
- Advanced mobile-specific interaction design
