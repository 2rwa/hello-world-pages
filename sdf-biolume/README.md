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

## Organic amoeba deformation (v2)
The **有機変形** slider continuously morphs from the original radial star (0) to an uneven amoeba (1, default).
Pseudopods differ in length, radius, angle and bend, all built from animated SDF spheres and capsules. Internal vacuoles and minor traveling skin waves make the silhouette pulse. The bounded wave displacement is not a mathematically exact SDF, so tracing uses a conservative factor of 0.49.
Run `?organic=0` to start with the original star. CI freezes animation and checks actual readback changes for organic morphology, arm count, fusion and shading; Chrome also captures star/amoeba comparison screenshots.
