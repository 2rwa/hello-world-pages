# PRISM / MORPH

A single-file Japanese WebGPU raymarching glass-prism demo: [open the live Pages demo](https://2rwa.github.io/hello-world-pages/prism-morph/).

The editable application is `index.html` with inline HTML, CSS, JavaScript, and WGSL. No runtime libraries are required.

## Interaction

- Triangle → hexagon → circular prism morph, twist, IOR, and chromatic dispersion sliders.
- Palette and rendering-resolution selectors; auto morph and pause buttons.
- Drag to orbit, wheel to zoom, reset button.
- URL `?test=1` uses an offscreen WebGPU render target for SwiftShader CI.

## Regression test

`.github/workflows/prism-morph-webgpu.yml` runs headless Chromium with SwiftShader. It checks WGSL diagnostics, GPU pipeline, actual GPU pixel readback and distinct rendered-pixel checksums after UI controls change. Script: `.github/scripts/prism-morph-ci.mjs`.
