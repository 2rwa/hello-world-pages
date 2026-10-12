# SDF STRIKER

WebGPU + WGSL signed-distance ray-marched prototype of a flying shooter-character.
No mesh, textures, imported models, Three.js or Babylon.js.

- Rounded capsule torso, SDF sphere reactor, visor and glowing eyes
- Jointed mirrored arms, rotor weapon pods, antenna, wings, thruster fins
- 3D orbit camera with pointer/slider, speed/quality controls, pause
- Surface normals, multi-material lighting, torus and sphere SDFs
- Responsive canvas for phones, adjustable march cap/resolution

The cyan core is a **glass-like shading effect**, not physically-traced transparent refraction. Core shapes use exact primitive SDFs (union = min). Material boundary overlaps may show hard seams by design. GPU performance depends on device and ray step budget.

## CI

`?ci=1` renders the *same WGSL* into an offscreen GPU texture; checks shader compilation, pipeline and submit, validation scope, `queue.onSubmittedWorkDone`, mapAsync readback and pixel contrast. The CI workflow uses Chrome SwiftShader on ubuntu-latest. The offscreen path is necessary when headless Chromium cannot create a WebGPU canvas SharedImage.

## Run locally

`python3 -m http.server 8000` from the repository root, visit `/sdf-striker/` on localhost or HTTPS.
