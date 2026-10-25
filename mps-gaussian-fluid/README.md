# Gaussian Fluid Lab — WebGPU

3D Gaussian-splat fluid experiment using WebGPU compute shaders.

- Gaussian number-density kernel in 3D, finite neighborhood support.
- PBF-like Jacobi density projection inspired by MPS particle number density.
- Two density-projection iterations per frame, spherical tank confinement, gravity and SHAKE impulse.
- Gaussian alpha blending with billboard splats, GPU-only particle positions.
- Pointer orbit, pinch zoom, visual/physics kernel controls, motion sensor permission on iOS.
- CI with headless Chromium/SwiftShader, offscreen render and pixel readback.

This is **not** a mathematically complete Moving Particle Semi-implicit solver. It does **not** solve a pressure Poisson equation and should not be used to estimate physical fluid quantities.

Run at https://2rwa.github.io/hello-world-pages/mps-gaussian-fluid/

WebGPU requires a secure origin. Add `?ci=1` for the offscreen CI diagnostic route.
