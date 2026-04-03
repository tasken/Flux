# CPU Solver Modules

These modules implement a Jos Stam Navier-Stokes fluid solver and character-grid
visual mapping on the CPU.

`fluid.js` is actively used in the hybrid rendering pipeline: `src/simulation.js`
wraps its functions into a frame-steppable simulation manager with force injection
and RGBA pixel packing for GPU upload.

## Files

| File | Purpose |
|---|---|
| `fluid.js` | Pure Navier-Stokes solver: `addSource`, `diffuse`, `advect`, `project` |
| `fluid.test.js` | Solver unit tests (vitest) |
