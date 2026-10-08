# SPLAT DRIFT
A minimal playable arcade game made of procedural anisotropic Gaussian splats, rendered in WebGL2.

Play: https://2rwa.github.io/hello-world-pages/splat-drift/

- Fly through a luminous tunnel; collect cyan light and avoid pink clouds.
- 3 hull points, scoring combo, and a 6.5-second cooldown pulse.
- WASD / arrows / mouse / touch-drag, Space = pulse, P = pause, R = restart.
- Internal render resolution: 480x270, 720x405, 960x540, 1280x720, AUTO.
- No models, external libraries, or external assets.
- Each point is rendered as a rotated elliptical Gaussian billboard using WebGL2 instancing.
- This is a procedural Gaussian splat game, not an imported PLY scene reconstruction.

Tests: node --test tests/world.test.mjs
Serve over HTTP (ES module imports), then open /splat-drift/.
Browser smoke route: /splat-drift/?smoke=1; game state is available at window.__SPLAT_DEBUG__.getState().

Limitation: additive screen-facing Gaussian ellipses approximate projected covariance; no full 3D covariance matrices or occlusion sorting.
