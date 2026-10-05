# WebGPU Glass Foam Sphere

WebGPU + WGSL raymarch sample for a transparent glass sphere containing rising bubbles.

## Visual model

- outer shell: sphere SDF, Fresnel reflection + refraction
- internal bubbles: up to 28 animated sphere SDFs with liquid → gas → liquid refraction
- foam: up to 30 small white SDF spheres distributed near the upper inside surface
- local background image: browser file picker → `createImageBitmap` → WebGPU sampled texture
- live camera background: `getUserMedia()` → 480×270 cover staging canvas → WebGPU sampled texture each frame
- background fitting: aspect-preserving cover placement; the photo is refracted through glass and bubbles
- liquid: Beer–Lambert-like RGB absorption tint
- render resolution: fixed 480 × 270; CSS scaling does not increase raymarch cost

Local background files and camera frames stay in the browser. They are not uploaded by this sample. Camera access is requested only after pressing the camera button. Images larger than 2048 px on either axis are downscaled before GPU upload.

## CI

`?ci=1` uses the same shader and texture bindings, renders to an offscreen `rgba8unorm` texture, waits for GPU completion, checks validation, maps a readback buffer, and verifies visible output.
