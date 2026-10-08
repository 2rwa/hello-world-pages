# Procedural 3D Gaussian Splatting – WebGPU Lab

[Run in GitHub Pages](https://2rwa.github.io/hello-world-pages/gaussian-splatting-demo/)

A framework-free interactive WGSL/WebGPU **3D Gaussian splatting renderer**.
Each splat has a 3D position, three anisotropic scale components, a quaternion orientation, RGB, and opacity.
The vertex shader applies a perspective Jacobian to project the rotated 3D covariance onto a 2D ellipse;
the fragment shader evaluates the Gaussian footprint and blends premultiplied alpha.
Splats are sorted back-to-front by center depth on the CPU.

This is a **procedural rendering demonstration**, not a pretrained photogrammetry model
or an implementation of 3DGS image reconstruction/training.

## Controls
- Scenes: spiral galaxy, torus, petals and spherical shell
- Count: 400–30,000 splats
- Scale and opacity; toggle Gaussian footprints versus center points
- Auto rotation, pointer drag, wheel/pinch zoom, camera reset, random seed regeneration

## Tests

`.github/workflows/gaussian-splatting-webgpu.yml` runs Playwright and Chrome/SwiftShader,
using exactly the production WGSL shaders and pipeline on an offscreen WebGPU render target
to avoid headless canvas swapchain problems. Tests require actual GPU-submitted output,
RGBA readback, visible pixels in each scene, distinct scene images, and UI parameter changes.
PNG captures from GPU readback are retained as a downloadable GitHub Actions artifact.

Known limitations: color is view-independent (no spherical harmonics), CPU depth sorting
uses Gaussian centers, and splat generation is hand-authored rather than photo-reconstructed.
The 30,000-splat mode is intended for stress testing and can be slow on mobile GPUs.
