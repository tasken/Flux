# Flux — the Vortex of Forgotten Letters

Interactive, generative text-mode art rendered with WebGPU as a live character grid in the browser, with a WebGL fallback for compatibility.

A hybrid CPU+GPU renderer combines a Navier-Stokes fluid simulation with a procedural shader field. The CPU solver feeds density and velocity into the renderer, which uploads textures and renders the scene in a fullscreen pass. The shader warps coordinates, picks characters from a font atlas, and applies OKLch perceptual color. Pointer input injects forces into the fluid and adds instant visual glow. Lyric lines emerge as giant background letters — a split-flap cycling animation renders text onto a small bitmap that the shader scales to fill the entire screen, driving character density so words form from the grid itself.

## Features

- Hybrid CPU fluid simulation + GPU shader rendering
- OKLch perceptual color with cold-to-warm palette shift on click
- Non-repeating procedural animation via irrational frequency ratios (φ, √2)
- Pointer interaction that injects forces and energizes the field
- Giant background letters — lyrics emerge as massive density patterns via split-flap animation
- Real font metrics in the glyph atlas (fontBoundingBoxAscent/Descent)
- Random seed per session — each page load looks different
- Browser-native ES modules with no JavaScript package install
- Automated GitHub Pages deployment

## Tech Stack

- JavaScript (ES modules)
- WebGPU with WebGL fallback
- Python 3 standard library (local server + static build)
- Google Fonts (IBM Plex Mono)

## Getting Started

### Start development server

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. Reload the browser after editing a module.

### Create a production build

```bash
python3 scripts/build_site.py
```

The static artifact is written to `dist/`. Preview it with:

```bash
python3 -m http.server 8000 --directory dist
```

The web app has no install step. The optional density-ramp utility requires Pillow (`python3 -m pip install pillow`).

## Project Structure

```text
webArt/
├── index.html
├── src/
│   ├── main.js             # entry: boot, pointer, animation loop
│   ├── build-info.js       # local metadata defaults; generated in production builds
│   ├── renderer.js         # WebGPU renderer with WebGL fallback, font atlas, fluid/word textures
│   ├── sketch.js           # GLSL shaders, visual config, OKLch color
│   ├── settings.js         # all tunable constants in one place
│   ├── simulation.js       # CPU fluid sim wrapper with RGBA packing
│   ├── fluid.js            # Navier-Stokes solver (used by simulation.js)
│   └── words.js            # split-flap lyric cycler with bitmap output
├── scripts/
│   ├── build_site.py       # package native modules and generate build metadata
│   └── derive_density_ramp.py
├── .github/workflows/      # GitHub Pages deploy
└── index.html
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
- **GPU-only simulation** — move the solver to WebGPU compute shaders or more advanced GPU-side fluid passes

## Available Commands

| Command | Description |
|---|---|
| `python3 -m http.server 8000` | Serve source modules for local development |
| `python3 scripts/build_site.py` | Create the static production artifact |
| `python3 -m http.server 8000 --directory dist` | Preview the production artifact |
