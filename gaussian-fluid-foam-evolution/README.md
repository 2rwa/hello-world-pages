# Gaussian Fluid Foam Evolution / WebGPU

An independent WebGPU experiment. The previous \`gaussian-fluid-jacobian/\` and FFT versions are not edited.

The simulation drives a 160x160 periodic shallow-water height/velocity grid from 384 moving Gaussian pressure particles. A short-memory horizontal displacement field is used to evaluate the empirical Jacobian whitecap indicator:

\`J = (1 + ∂x Dx)(1 + ∂z Dz) - (∂z Dx)(∂x Dz)\`

A separate GPU foam compute pass **backtraces water velocity** and updates four floating-point history channels on a ping-pong grid:
- **R**: foam coverage, exponential decay rate 0.22 / s
- **G**: freshly created white foam, rate 0.70 / s
- **B**: subsurface microbubbles, rate 0.40 / s
- **A**: persistent reflection-damping slick, rate 0.11 / s

All foam rates are divided by \`Foam persistence\`, so >1 produces longer-lived foam.
The visual shader uses layered world-anchored noise and thin filaments to give the coverage a ragged shape. Fresh foam is brighter and more opaque; older coverage turns blue-green. Bubbles tint the water below, while the slick darkens the reflected water subtly.

Debug views:
- Height and foam
- Jacobian compression/expansion
- Foam channel quadrants (top-left R, top-right G, bottom-left B, bottom-right A)

This is an empirical visual effect, not SPH/FLIP, physical breaking or literal 3D geometry for bubbles. It uses an approximate finite-memory horizontal deformation map, not true Lagrangian particle deformation.

CI runs production WGSL compute pipelines for 48 frames using SwiftShader, reads back the RGBA foam buffer, validates each active channel, checks Jacobian compression and inspects rendered pixels.

Demo: https://2rwa.github.io/hello-world-pages/gaussian-fluid-foam-evolution/
