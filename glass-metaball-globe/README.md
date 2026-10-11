# Glass Metaball Globe

Standalone WebGPU browser experiment: **refractive smooth-union glass metaballs moving within a transparent external glass sphere**.

Demo: https://2rwa.github.io/hello-world-pages/glass-metaball-globe/

## Features

- 1–28 separately simulated spherical marble centers with collision, swirling turbulence, buoyancy, cohesion and outer shell containment
- Polynomial smooth-min blending for implicit glass shapes: blend=0 for separate spheres, higher values for smooth fusion/necking; optional surface deformation
- WebGPU fullscreen fragment raymarching with **guarded small steps**, not naive sphere tracing (smooth union / deformation are not exact SDFs)
- Surface finite-difference normals, first interface refraction, approximate glass interior exit and second refraction, Schlick-like Fresnel, RGB chromatic dispersion, studio environment and specular softboxes
- Separate transparent outer globe Fresnel + glints, customizable reflection, IOR, dispersion, material tint, thickness, environment, blur, postprocess bloom
- Five presets: Crystal / Liquid Glass / Prismatic / Deep Sea / Marbles
- Detailed controls (sliders plus precise number inputs), live parameter search, browser autosave, JSON import/export, reset
- Desktop panel initially open; mobile panel initially collapsed; **persistent open/close settings button** at the bottom-right
- Touch orbit/pinch zoom, mouse drag/wheel zoom, auto resolution scaling

### Caveats
- The glass is **stylized real-time rendering**. It approximates ray paths through the metaball union; it is not a full spectral path tracer with multiple bounces.
- GPU cost scales with screen pixels × march iterations × marble count, so low quality on mobile is recommended.
- No runtime dependency on external 3D engines.

### Tests
`node --test glass-metaball-globe/tests/physics.test.mjs`

GitHub Actions checks WebGPU WGSL compilation, pipelines, actual offscreen GPU draw + readback, parameter-driven pixel changes, 28 marbles, physics bounds, and desktop/mobile menu reachability. `?ci=1` uses production shader pipelines and an offscreen render target in headless SwiftShader.

