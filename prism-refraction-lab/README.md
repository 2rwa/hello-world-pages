# Prism Refraction Lab

**Live demo:** https://2rwa.github.io/hello-world-pages/prism-refraction-lab/

A single-file WebGPU + WGSL raymarching demo that morphs a glass triangular prism
through a hexagonal prism to a cylinder. The page includes multiple internal
reflections, RGB dispersion, volume absorption, Fresnel highlights, a two-pass
scene-compositing pipeline and stylized floor caustics.

## Files and source

- `index.html`: published, dependency-free self-contained HTML application.
- Source-of-truth WGSL, UI modules and bridge assembly workflow:
  [bridge/.bridge/refraction-lab](https://github.com/2rwa/bridge/tree/main/.bridge/refraction-lab)
- Browser regression runner:
  [prism-refraction-lab-ci.yml](https://github.com/2rwa/hello-world-pages/blob/main/.github/workflows/prism-refraction-lab-ci.yml)
- Browser regression script:
  [prism-refraction-lab-ci.mjs](https://github.com/2rwa/hello-world-pages/blob/main/.github/scripts/prism-refraction-lab-ci.mjs)

## Verification

GitHub Actions invokes Headless Chrome with SwiftShader, compiles WGSL, builds both
render pipelines, submits real GPU draws and reads pixels back from the
background and composited render targets. UI tests verify distinct rendered
results for morph, twist, IOR, dispersion, absorption, internal reflections,
caustics, palette and diagnostic modes, plus resolution and button state.
A PNG of each GPU-rendered target is saved in a 30-day Actions artifact.

**Limitations:** Screen-space reprojection approximates the environment beyond
the prism; colored caustics are artistic/procedural, not photon-traced.
Conservative SDF march steps handle the twisted/interpolated shapes.
