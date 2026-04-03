# CPU Solver Modules

These modules implement a Jos Stam Navier-Stokes fluid solver and character-grid
visual mapping on the CPU. The solver is now actively used in the hybrid rendering
pipeline: it runs each frame, and its output is uploaded as a texture to the GPU
fragment shader.

`src/simulation.js` wraps these functions into a frame-steppable simulation
manager with force injection and RGBA pixel packing for GPU upload.

## Files

| File | Purpose |
|---|---|
| `fluid.js` | Pure Navier-Stokes solver: `addSource`, `diffuse`, `advect`, `project` |
| `fluid.test.js` | Solver unit tests (vitest) |
| `map.js` | Fluid-state → character mapping: `flowChar`, `densityColor`, `speedWeight` |
| `map.test.js` | Mapping unit tests (vitest) |
