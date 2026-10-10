# Liquid Glass Metaball Globe

Independent WebGPU experiment derived from `metaball-globe` without changing it.

- Transparent glass metaballs smoothly merge into a single refractive surface, using polynomial smooth-min over up to 64 glass droplets.
- 0–10 solid-colored metaballs remain nonintersecting with the glass droplet centers; glass/glass collisions are deliberately disabled.
- Glass/refraction is approximated via raymarching an implicit field (conservative stepping and exit sign refinement), not a full fluid solver.
- Controls: glass droplets 0–64, fusion width .02–.65, solid bead count 0–10, speed, internal resolution, pause/reset, orbit/zoom.
- At high counts or resolution rendering is computationally heavy, especially on mobile GPUs.

To run, host this folder on HTTPS (`python -m http.server` on localhost also works). All assets are local.

CI: `node tests/physics-smoke.mjs`, headless Chrome/SwiftShader via `tests/webgpu-smoke.cjs`.

Production URL: https://2rwa.github.io/hello-world-pages/glass-metaball-globe/
