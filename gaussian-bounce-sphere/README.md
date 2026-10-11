# Gaussian Bounce Sphere

Interactive WebGPU Gaussian-density metaballs inside a transparent glass globe. 1–100 independent particles; fixed 120Hz physics; CPU spatial-hash neighbor acceleration and GPU ray-candidate culling; Solid/Cloud/Hybrid/Debug modes; Fresnel, refraction, wall ripples, Bloom, temporal trails and auto resolution scaling.

[Try on GitHub Pages](https://2rwa.github.io/hello-world-pages/gaussian-bounce-sphere/)

- The control panel can be minimized via `✕`; a floating `☰ CONTROLS` button restores it (collapsed by default on mobile).
- Drag to orbit, pinch/wheel to zoom. Open performance settings to switch automatic scaling or ray acceleration.
- Multiple quality and lighting settings trade fidelity for performance. 100 particles at full quality is demanding on mobile GPUs.
- Independent volumetric fog: **off / ambient / particles / mixed**. Control density, Gaussian halo contribution, animated turbulence, extinction, forward scattering, fog color, and height falloff; fog can coexist with solid metaballs.
- Fog reuses the production scene shader and GPU readback CI verifies a visible off/on difference at the pixel level.
- The sphere material uses a real summed Gaussian density field (not splatting), with a fixed-step iso crossing and bisection; `Cloud` uses volume integration.
- The refraction path is a two-interface approximation; the temporal trail is screen-space blending.
- CI: `?ci=1` disables the canvas swapchain and performs actual WebGPU rendering into an offscreen texture, reads back pixels, and exposes `document.documentElement.dataset.webgpuStatus`.

Run `node --test gaussian-bounce-sphere/tests/physics.test.mjs` for deterministic physics regressions.
