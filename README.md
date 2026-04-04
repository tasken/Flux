# Flux — the Vortex of Forgotten Letters

Interactive, generative text-mode art rendered with WebGL as a live character grid in the browser.

A hybrid CPU+GPU renderer combines a Navier-Stokes fluid simulation with a procedural shader field. The CPU solver feeds density and velocity into a fragment shader that warps coordinates, picks characters from a font atlas, and applies OKLch perceptual color. Pointer input injects forces into the fluid and adds instant visual glow. Lyric lines emerge as giant background letters — a split-flap cycling animation renders text onto a small bitmap that the shader scales to fill the entire screen, driving character density so words form from the grid itself.

## Features

- Hybrid CPU fluid simulation + GPU shader rendering
- OKLch perceptual color with cold-to-warm palette shift on click
- Non-repeating procedural animation via irrational frequency ratios (φ, √2)
- Pointer interaction that injects forces and energizes the field
- Giant background letters — lyrics emerge as massive density patterns via split-flap animation
- Real font metrics in the glyph atlas (fontBoundingBoxAscent/Descent)
- Random seed per session — each page load looks different
- Shader-only HMR — edit `src/sketch.js` and see changes without page reload
- Automated GitHub Pages deployment

## Tech Stack

- JavaScript (ES modules)
- WebGL
- Vite (dev server + build)
- Google Fonts (IBM Plex Mono)

## Getting Started

### Install dependencies

```bash
npm install
```

### Start development server

```bash
npm run dev
```

### Create a production build

```bash
npm run build
```

## Project Structure

```text
webArt/
├── index.html
├── src/
│   ├── main.js             # entry: boot, pointer, animation loop
│   ├── renderer.js         # WebGL program, font atlas, fluid/word textures
│   ├── sketch.js           # GLSL shaders, visual config, OKLch color
│   ├── settings.js         # all tunable constants in one place
│   ├── simulation.js       # CPU fluid sim wrapper with RGBA packing
│   ├── fluid.js            # Navier-Stokes solver (used by simulation.js)
│   └── words.js            # split-flap lyric cycler with bitmap output
├── .github/workflows/      # GitHub Pages deploy
├── vite.config.js
└── package.json
```

## Interaction

- **Move pointer** — injects forces into the fluid sim + adds shader glow
- **Click and drag** — amplifies forces and shifts palette warm

## How It Works

The fragment shader combines stateless procedural animation with live fluid data in a single pass:

1. **Fluid sampling** — reads density, velocity, and speed from the CPU simulation texture
2. **Procedural background** — domain warping (3 passes) + wave interference (5 layers) with irrational frequency ratios (φ, √2) for non-repeating motion
3. **UV warping** — displaces coordinates by fluid velocity for organic distortion
4. **Pointer glow** — adds glow/burst near the cursor for instant visual feedback
5. **Giant letters** — scales the word bitmap across the full grid with aspect correction and noise warp, blending text density into the background
6. **Glyph lookup** — maps the combined value to a character in the density ramp:
   ```
    .·:;-=+*abcXYZ#@W
   ```
7. **OKLch color** — vorticity, speed, and density drive a cold palette (blue → cyan → purple) that shifts warm (orange/red) on click

## Roadmap

Roughly ordered by impact vs effort.

- **Ambient curl-noise stirring** — derive a curl field from `procValue` and inject as a gentle force, keeping the canvas alive at rest
- **Feedback / frame history** — ping-pong FBO for motion trails, bloom, and temporal blending
- **Multi-touch interaction** — track multiple simultaneous touch points for tablet/phone engagement
- **Ambient density injection** — sparse random density each frame to prevent the canvas from going dark
- **Screenshot / GIF export** — capture frames via `toBlob` or record a short sequence
- **GPU-only simulation** — move the solver to WebGL 2 transform feedback or WebGPU compute shaders

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Create a production bundle |
| `npm run preview` | Preview the production build |
| `npm run check` | Run build |
