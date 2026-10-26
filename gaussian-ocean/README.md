# Gaussian Ocean — WebGPU
A standalone experimental ocean generated from **576 oriented Gaussian wave packets**, a 192×192 damped height-field wave solver, and WebGPU full-screen height intersection / Fresnel shading.

## Live site

https://2rwa.github.io/hello-world-pages/gaussian-ocean/

## Controls

- Drag to look around; tap the ocean to inject a splash into the wave solver.
- Wave energy, choppiness, wind, whitecaps, sun elevation, and camera height.
- **Show Gaussian envelopes**: heat-map view of the packet-envelope contributions.
- Pause and reset.

## How it works

1. Compute shader sums 3×3 neighboring oriented Gaussian-envelope / cosine-carrier packets for each simulation cell.
2. The damped 2-D wave equation evolves water height and velocity; a Gaussian impact force creates interactive ripples.
3. The compute pass writes a filtering-compatible `rgba16float` wave texture.
4. A full-screen render shader brackets water-surface intersections and refines with 11 bisection steps (the height function is not a signed distance field).
5. Analytic long swells, slope normals, Fresnel sky reflection, sun glints, fog, and whitecaps make the field read as an open sea.

This is a **Gaussian-driven 2D wave simulation**, not a full 3D Navier–Stokes solver, PBD fluid, or Gaussian Splatting scene reconstruction.

## Test

The GitHub Actions workflow `.github/workflows/gaussian-ocean-ci.yml` launches Chromium/SwiftShader to compile WGSL, dispatch compute, render to an offscreen texture, read back non-black pixels, and check UI interaction.

Test-only `?ci=1` uses the same compute/render pipelines with an offscreen target for headless browsers.

No external JavaScript libraries or network assets are required at runtime.
