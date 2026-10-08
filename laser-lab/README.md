# PROJECT LOCK-ON · Laser Flight Lab (Phase 1)
Playable browser-only vertical shooter + three lock-on laser algorithms. Independent of the original top-level index.html.

## Open
Run a static HTTP server from the repository root, then open /laser-lab/ (ES modules require an HTTP origin).
The test deployment is https://2rwa.github.io/hello-world-pages/laser-lab/ once published.

## Controls
- WASD/arrow keys: ship movement; drag on touch device.
- Hold X: lock up to 8 targets; release X: launch staggered homing lasers.
- Z: normal shots (optional automatic fire), SPACE: start/restart, D: demo, P: pause.
- Mobile: tap LOCK to start locking, tap FIRE! to launch.
- Laser path modes: HYBRID (flare → turn-to-target), HOMING (limited angular velocity), BEZIER (dynamic endpoint).
- Large ground boss supports 4 simultaneous locks; every other enemy supports one.
- Expose flight speed, turn limit, trail lifetime, beam width, and launch delay as live sliders.

## Rendering
The scrolling playfield, enemies, HUD and normal bullets are Canvas2D. Laser ribbon meshes are built from **actual projectile trail positions** and blended using WebGPU/WGSL. WebGPU unavailable -> Canvas2D fallback. Multiple translucent ribbon layers give a white core / blue sheath / glow.
Main canvas resolution selectable independently of laser resolution; no third-party runtime libraries.
Ray-marched terrain/boss geometry and physics-based sound are deferred to Phase 2+ (not claimed for this version).

## Validation
- Node: node --test laser-lab/tests/flight.test.mjs
- Browser: install Playwright, start an HTTP server on port 8080 from repository root, then node laser-lab/tests/browser.mjs.
- CI workflow checks math, gameplay state, browser controls, and captures a screenshot.
Known limitation: GPU fallback after a WebGPU context has already been acquired needs an overlay canvas. Browser test on SwiftShader may use software GPU.

Inspired by the layered lock-on gameplay of classic arcade vertical shooters; original visual assets, code and sound.