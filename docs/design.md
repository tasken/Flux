# webart — Design Spec

**Date:** 2026-04-02  
**Status:** Current

---

## Overview

A personal creative playground for generative, interactive fluid art rendered as a character grid. The user edits a single sketch file locally; the browser reloads instantly via Vite HMR. Inspired by [play.ertdfgcvb.xyz](https://play.ertdfgcvb.xyz), which is built on the ABC library.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | [ABC library](https://play.ertdfgcvb.xyz) | Same lib as ertdfgcvb; provides char grid loop, lifecycle hooks, DOM renderer |
| Dev server | Vite | Instant HMR — sketch file changes reflect without page reload |
| Language | Vanilla JS (ES modules) | No framework overhead; ABC is module-native |

---

## Project Structure

```
~/webArt/
├── index.html           ← fullscreen pre#abc, imports main.js
├── src/
│   ├── main.js          ← entry: run(sketch)
│   ├── sketch.js        ← ABC lifecycle hooks + fluid state + curl-noise injection
│   ├── fluid.js         ← pure Navier-Stokes solver (addSource, diffuse, advect, project)
│   ├── map.js           ← pure visual mapping (flowChar, densityColor, speedWeight)
│   ├── fluid.test.js    ← solver unit tests
│   └── map.test.js      ← visual mapping unit tests
├── vendor/
│   └── play.core/       ← vendored ABC library (gitignored)
├── docs/
│   └── design.md        ← this file
├── vite.config.js       ← dev server config (host, port, optimizeDeps)
└── package.json         ← deps: vite (dev); vitest (test)
```

---

## Architecture

ABC provides the character grid loop. The sketch exports four lifecycle hooks:

### `boot({ cols, rows })`
Runs once before the first frame. Allocates eight `Float32Array(cols × rows)` buffers:
`density`, `densityPrev`, `vx`, `vy`, `vxPrev`, `vyPrev`, `p` (pressure scratch), `div` (divergence scratch).

Seeds the field with a curl-noise pattern (sin/cos of normalised grid coords) so there is visible motion from frame one.

### `pre(context, cursor)`
Runs once per frame before `main()`. Steps in order:

1. **Curl-noise injection** — every `CURL_STEP=6` cells, approximate the curl of an fBm potential field via finite differences (`vx = ∂ψ/∂y`, `vy = -∂ψ/∂x`). Divergence-free by construction: no net drift accumulates over time.
2. **Cursor injection** — density burst + velocity impulse in a radius-3 disc at cursor position; 3× stronger on mouse-down.
3. **Solver** — runs `PASSES=2` full Navier-Stokes passes (velocity step + density step each pass).
4. **Decay** — `vxPrev/vyPrev/densityPrev *= 0.8` (source buffer drain); `density *= 0.997` (long-term saturation guard); `vx/vy *= 0.988` (linear drag — keeps speed bounded, prevents all-arrow lock-in).

### `main(coord, context)`
Runs once per cell per frame. Returns a styled character from `map.js`:

```js
return {
  char:       flowChar(density[i], vx[i], vy[i]),
  color:      densityColor(density[i], vx[i], vy[i]),
  fontWeight: speedWeight(vx[i], vy[i]),
}
```

### `post()` (optional)
Reserved for future overlays (e.g. debug velocity arrows, cursor indicator).

---

## Fluid Simulation: Navier-Stokes (Jos Stam, 1999)

Based on *Real-Time Fluid Dynamics for Games* (Stam, GDC 1999). Each solver pass runs three steps on both the density and velocity fields:

1. **Diffuse** — spread values to neighbours via Gauss-Seidel relaxation (20 iterations)
2. **Advect** — move values along the velocity field using bilinear interpolation
3. **Project** — enforce divergence-free flow (prevents energy blow-up); also uses Gauss-Seidel

Boundary conditions: velocity uses clamped `setBounds` (no-slip at walls); pressure uses averaged `setBounds`. The `project` step does **not** apply `setBounds` to the post-projection velocity (physically correct: enforcing divergence-free is sufficient).

Solver is in `src/fluid.js` — all pure functions, no global state, fully unit-tested.

---

## Character Visual Mapping (`src/map.js`)

All three functions are pure (no side effects) and unit-tested.

| Fluid signal | Visual property | Detail |
|---|---|---|
| Density | Character (low speed) | 16-char ramp `' ·.-~:+ca01OX#@$'` — sparse → dense |
| Velocity direction | Character (high speed) | 8-direction arrows `→ ↘ ↓ ↙ ← ↖ ↑ ↗` when `speed > 0.3` |
| Velocity magnitude | `fontWeight` | `300` (still) / `400` (medium) / `700` (fast) |
| Density | Lightness | `hsl(h, 55%, density * 60%)` — dark background, bright dense regions |
| Vorticity `(vy − vx)` | Hue | Base 210° (cool blue) ± 45° — subtle breath of colour, no strobing |

---

## Interaction

- **Mouse move** — injects a density burst + velocity impulse at cursor position each frame
- **Mouse down** — increases injection strength (stronger force)
- Force magnitude and radius are tunable constants at the top of `sketch.js`

---

## Dev Workflow

```bash
cd ~/webArt
npm install
npm run dev        # Vite starts, opens browser
# edit src/sketch.js → browser reflects changes instantly (no page reload)
```

ABC reruns `boot()` and restarts the animation loop when the module hot-reloads.

---

## Out of Scope (v1)

- Multiple sketches / gallery
- Per-character size, rotation, opacity (requires Canvas 2D renderer — deferred)
- Saving/sharing sketches
- Mobile touch support
