# BIOLUME — SDF metaball shooter lifeform
Live: https://2rwa.github.io/hello-world-pages/sdf-biolume/

A floating glass/gel alien character built entirely from WGSL SDF primitives. No mesh or textures.
- **Smooth Union** between spheres and segmented capsules, adjustable 3–7 arms and blend radius.
- Animated arms and floating body; glowing eye organs and internal reactor.
- Approximate single refraction and analytic internal core sphere intersection, **not** multi-bounce physical refraction.
- Orbit controls (mouse / touch), zoom and material normal debug display.
- WebGPU canvas presentation and independent offscreen readback CI.

To run locally, serve this repository over HTTP or HTTPS (for example Python http.server from repository root). Open /sdf-biolume/.
For diagnostics: `?ci=offscreen` enables an offscreen GPU render with readback; `?ci=canvas` renders one frame through the production canvas pipeline.
