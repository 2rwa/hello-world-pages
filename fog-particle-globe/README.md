# Fog Particle Globe

A standalone WebGPU experiment based on **thousands of translucent Gaussian fog sprites**, not the ray-marched Gaussian isosurfaces used in Gaussian Bounce Sphere.

- Particles: 25–2400, world-space positions inside a transparent sphere, CPU 120 Hz fluid-inspired drift/swirl/wind/turbulence, wall collision and view-depth sorting.
- Rendering: instanced camera-facing Gaussian quads, procedural wisps, back-to-front premultiplied alpha blending, glass shell rim, scattering-inspired tint, bloom, temporal trails.
- Presets: Mist, Smoke, Nebula, Storm.
- GUI controls: particle count/size/distribution, density/opacity, physics flow, velocity, buoyancy, color and scattering, transparency, post effects and auto quality.
- Mobile: collapsed menu by default. Tap the floating CONTROLS button to reveal. Touch orbit and pinch zoom.
- No Three.js or external runtime dependencies. JavaScript + WGSL + WebGPU.
- CI: `?ci=1` switches only the final render target to an offscreen GPUTexture, using the same shaders/pipelines. Browser CI does GPU draw, readback, density pixel difference, 2400-particle rendering, parameter changes, and phone-sized menu regression.

Try: https://2rwa.github.io/hello-world-pages/fog-particle-globe/

This is **billboard particle fog** rather than physically accurate volumetric ray-marched scattering. It is efficient for larger numbers of particles but can show sprite-plane artifacts at extreme camera angles.

Physics test: `node --test fog-particle-globe/tests/physics.test.mjs`.
