# webArt

Interactive, generative text-mode art rendered with WebGL as a live character grid in the browser.

The current runtime draws a fullscreen shader-driven field and samples a font atlas to turn that field into animated glyphs, color, and weight. Pointer movement and press state feed the shader directly for live interaction.

## Features

- Real-time procedural motion on a character grid
- Pointer interaction that bends and energizes the field
- Fast local workflow with Vite
- Unit tests for experimental solver and mapping modules

## Tech Stack

- JavaScript (ES modules)
- WebGL
- Vite (dev server)
- Vitest (tests)
- Google Fonts for IBM Plex Mono

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Start development server

```bash
npm run dev
```

This starts the local dev server with hot reload.

### 3) Run tests

```bash
npm test
```

### 4) Create a production build

```bash
npm run build
```

## Project Structure

```text
webArt/
├── index.html
├── src/
│   ├── main.js
│   ├── renderer.js
│   ├── sketch.js
│   ├── fluid.js        # experimental solver module, not wired into runtime
│   ├── fluid.test.js
│   ├── map.js          # experimental mapping module, not wired into runtime
│   └── map.test.js
├── docs/
│   ├── design.md
│   └── plan.md
├── vite.config.js
└── package.json
```

## Interaction

- Move the pointer to bend the field and shift the palette
- Press and drag for a stronger burst

## Available Scripts

- `npm run dev`: start Vite dev server
- `npm run build`: create a production bundle
- `npm test`: run test suite once with Vitest

## Notes

- The runtime lives in [src/main.js](/home/augusto/webArt/src/main.js), [src/renderer.js](/home/augusto/webArt/src/renderer.js), and [src/sketch.js](/home/augusto/webArt/src/sketch.js).
- `src/fluid.js` and `src/map.js` are currently retained as tested experiments rather than active runtime dependencies.
- For reproducible CI or deployment, use `npm ci` when a lockfile is present.
