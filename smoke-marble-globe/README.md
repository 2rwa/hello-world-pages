# Smoke Marble Globe

Standalone **WebGPU smoke-marble experiment** where soft Gaussian-shaped smoke balls act as 3D soft spheres. Two phases (A/B) attract their own kind and repel the other; soft collision, wind, swirling turbulence, buoyancy and non-wetting glass boundary reproduce a stylized oil/water-like interaction.

Play: https://2rwa.github.io/hello-world-pages/smoke-marble-globe/

## Components

- 8–192 independently moving 3D smoke marbles in a transparent globe (fixed 120 Hz CPU physics)
- Two-phase attraction/repulsion and soft overlapping collision
- **Glass-shy** force repels each ball from the inner glass before contact; a hard contact constraint and tangential slip enforce non-wetting
- Instanced back-to-front Gaussian **smoky spherical sprites** with animated filaments, semitransparent blending, phase tint, rim glass, post Bloom and temporal trails
- Sliders **and exact numeric inputs** across categorized parameters: physical, phase, glass, dynamics, optics and resolution
- 5 presets: Glass Shy / Oil-Water / Smoke Pearls / Storm / Mist
- Preset search, initial reset, JSON import and export, browser localStorage auto-save
- Always-visible bottom-right settings toggle on desktop and mobile; desktop initial panel open, mobile initial panel closed
- Touch/pointer orbit, wheel/pinch zoom
- No Three.js or external client runtime

## Testing

`node --test smoke-marble-globe/tests/physics.test.mjs`

GitHub Actions on every app update tests deterministic motion, 192-body glass exclusion, phase population, oil/water separation, parameter safety, actual SwiftShader WebGPU pipeline rendering and pixel readback, desktop control panel size/clickability and mobile menu reachability.

`?ci=1` renders the production shaders to a WebGPU offscreen texture, avoiding headless swapchain failures. CI GPU screenshot captures are retained as workflow artifacts.

These are **soft spherical particles rendered as procedural Gaussian fog**, not a full SPH multiphase liquid solver or physically correct volumetric ray tracing. The optical glass effect is approximated.
