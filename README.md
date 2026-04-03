# webArt

Interactive, generative text-mode art rendered with WebGL as a live character grid in the browser.

A hybrid CPU+GPU renderer combines a Navier-Stokes fluid simulation with a procedural shader field. The CPU solver feeds density and velocity into a fragment shader that warps coordinates, picks characters from a font atlas, and applies OKLch perceptual color. Pointer input injects forces into the fluid and adds instant visual glow. A secondary "words" mode overlays split-flap animated text through the same warped field.

## Features

- Hybrid CPU fluid simulation + GPU shader rendering
- OKLch perceptual color with cold-to-warm palette shift on click
- Non-repeating procedural animation via irrational frequency ratios (φ, √2)
- Pointer interaction that injects forces and energizes the field
- Split-flap word animation mode (press key 2)
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
│   ├── main.js             # entry: boot, pointer, animation loop, mode switching
│   ├── renderer.js         # WebGL program, font atlas, fluid/word textures
│   ├── sketch.js           # GLSL shaders, visual config, OKLch color
│   ├── simulation.js       # CPU fluid sim wrapper with RGBA packing
│   ├── words.js            # split-flap word cycler
│   └── cpu-solver/
│       └── fluid.js        # Navier-Stokes solver (used by simulation.js)
├── docs/
│   ├── design.md           # architecture and design spec
│   └── future.md           # improvement roadmap
├── .github/workflows/      # GitHub Pages deploy
├── vite.config.js
└── package.json
```

## Interaction

- **Move pointer** — injects forces into the fluid sim + adds shader glow
- **Click and drag** — amplifies forces and shifts palette warm
- **Key 1** — procedural mode (default)
- **Key 2** — words mode (split-flap animated text)

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Create a production bundle |
| `npm run preview` | Preview the production build |
| `npm run check` | Run build |
