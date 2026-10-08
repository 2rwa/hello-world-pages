# Gaussian × SDF Raymarch (WebGPU)

[Live demo](https://2rwa.github.io/hello-world-pages/gaussian-raymarch-hybrid/)

A separate experiment built next to the original [3D Gaussian Splatting demo](../gaussian-splatting-demo/). Procedurally generated colored, rotated, anisotropic Gaussians share a world with an SDF glass orb and torus.

## Three render modes

1. **3D Gaussian Splatting + SDF:** Reuses the original tested Jacobian/covariance-projected ellipse renderer and CPU back-to-front sorting. Renders Gaussian billboards to a texture, then traces an SDF glass orb and samples that image for approximate screen-space refraction.
2. **Gaussian volume + SDF:** Evaluates a 3D Gaussian mixture density at fixed ray samples and applies front-to-back emission/absorption compositing, plus SDF sphere tracing.
3. **Iso density + SDF:** Fixed-step density threshold crossing with bisection refinement (NOT unsafe SDF sphere tracing on a non-distance field), gradient normal, and nearest-hit comparison with the true SDF orb.

All modes use the same fullscreen WGSL raymarch shader for sphere/torus geometry. The Gaussian data is **synthetic** rather than reconstructed from photographs. The glass refraction is an approximation (screen-space in mode 1, local density tint in modes 2–3), not physically exact path tracing. Mode 1 is not a physically correct per-Gaussian depth/occlusion solution.

## Controls and cost

Resolution selector: 320×180, 480×270 (default), 640×360, 960×540, 1280×720, 1920×1080, 2560×1440, and 3840×2160. It adjusts the **actual internal render target**, not just CSS size. M4 users can select higher resolutions. Mode 2 costs roughly O(pixels × steps × Gaussian count); Mode 3 can be similarly expensive. Start small before raising count/steps/resolution.

Controls: mode, scene, count 16–128, volume steps 12–64, Gaussian opacity/density, Gaussian radius, SDF sphere radius, regenerate, camera pointer drag/pinch/wheel, auto-orbit and reset.

## Test

`node --check gaussian-raymarch-hybrid/app.js` and run the repository's `.github/workflows/gaussian-raymarch-hybrid.yml` in GitHub Actions for Chrome/SwiftShader. The CI mode `?ci=1` creates an offscreen render target instead of depending on Linux headless WebGPU swapchain. It tests **the production WGSL and GPU pipelines**, submits draws, waits, reads back pixels, saves PNGs, and verifies visible changes from render mode and UI operations. Low-res CI uses 320×180, 16 Gaussians, 12 steps.

No Three.js, bundler, npm runtime dependencies, or third-party libraries in the deployed page.
