# CPU Solver Modules

These modules implement a Jos Stam Navier-Stokes fluid solver and character-grid
visual mapping on the CPU.

`fluid.js` is actively used in the hybrid rendering pipeline: `src/simulation.js`
wraps its functions into a frame-steppable simulation manager with force injection
and RGBA pixel packing for GPU upload.

`map.js` is retained as tested reference code from an earlier CPU-only renderer
direction. It is not imported at runtime but remains useful if the project returns
to CPU-side character mapping.

## Files

| File | Purpose | Status |
|---|---|---|
| `fluid.js` | Pure Navier-Stokes solver: `addSource`, `diffuse`, `advect`, `project` | Active (used by `simulation.js`) |
| `fluid.test.js` | Solver unit tests (vitest) | Active |
| `map.js` | Fluid-state → character mapping: `flowChar`, `densityColor`, `speedWeight` | Reference only |
| `map.test.js` | Mapping unit tests (vitest) | Active |
