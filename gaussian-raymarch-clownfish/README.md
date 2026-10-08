# Clownfish Gaussian × Raymarch (WebGPU)

[Live demo](https://2rwa.github.io/hello-world-pages/gaussian-raymarch-clownfish/)

A separate demo that uses a **user-uploaded clownfish photo** as the source for colored 3D Gaussian splats, then combines those splats with a **raymarched SDF glass sphere**.

## What it does

- Samples the uploaded image offline and keeps the central fish as the main subject.
- Prioritizes orange body, cyan band, and dark eye pixels.
- Suppresses much of the white anemone / gray background.
- Bakes the resulting Gaussian rows into `clownfish-data.js`.
- Displays the result in three modes:
  1. **Splat + glass sphere**
  2. **Volume integration + glass sphere**
  3. **Iso-density surface + glass sphere**

The glass sphere is a real SDF object rendered by WGSL raymarching. In splat mode, refraction is approximated from the rendered Gaussian image; in the volume/iso modes, the sphere samples nearby Gaussian density for a tinted transmission effect.

## Controls

- Internal resolution: 320×180 up to 3840×2160
- Gaussian count: 256 / 512 / 900 / 1200
- Volume steps: 12 / 24 / 40 / 64
- Density, Gaussian radius, glass sphere radius
- Auto orbit, pointer rotate, wheel/pinch zoom, reset, and re-seed / re-jitter

The default is 480×270, but higher resolutions are available for fast devices such as M4-class Macs.

## Test

`?ci=1` switches to an offscreen WebGPU render target and is used by GitHub Actions. The workflow validates the **real production pipelines and WGSL**, reads back actual pixels, saves PNGs, and checks that mode changes, resolution changes, UI changes, regenerate, and camera operations all alter the GPU result when expected.
