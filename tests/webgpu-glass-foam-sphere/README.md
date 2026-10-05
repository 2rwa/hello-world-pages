# WebGPU Glass Foam Sphere

WebGPU + WGSL raymarch sample for a transparent glass sphere containing rising bubbles.

## Visual model

- outer shell: sphere SDF, Fresnel reflection + refraction
- internal bubbles: up to 28 animated sphere SDFs
- foam: up to 30 small white SDF spheres distributed near the upper inside surface
- transition: internal bubbles shrink near the end of their rise cycle while foam bubbles use the same time field to pulse at the upper shell
- liquid: Beer–Lambert-like RGB absorption tint
- render resolution: fixed 480 × 270; CSS scaling does not increase raymarch cost

## CI

`?ci=1` renders the same shader/pipeline to an offscreen `rgba8unorm` texture, waits for GPU completion, checks the validation error scope, then maps a readback buffer and verifies non-empty visible output.
