# Gaussian Fluid Jacobian Whitecaps

Independent experiment derived from the Gaussian pressure shallow-water solver.

Unlike the FFT ocean, this simulation has no natural FFT horizontal displacement. It stores a finite-memory, semi-Lagrangian velocity-integrated **horizontal deformation map** D(x,z), relaxed exponentially each frame. This is an Eulerian approximation, not a true material Lagrangian map.

- Flow map: \`D_next(x) = exp(-0.45 dt) (sample(D_prev, x - u dt) + 2u dt)\`
- Area Jacobian: \`J = (1 + ∂x Dx)(1 + ∂z Dz) - (∂z Dx)(∂x Dz)\`
- Whitecap source: \`(1 - smoothstep(0.56, 0.94, J)) × strength × noise\`
- Foam: advected along velocity, exponentially decayed, and replenished at compression crests
- Debug: 2D height/foam display and explicit Jacobian heatmap (red = compression)

This is a visual empirical whitecap model, not a validated physical breaking-wave simulator.

## GPU regression test
Chrome/SwiftShader headless test dispatches 48 frames through all production GPU compute pipelines, reads deformation and foam storage buffers, checks computed Jacobian compression/foam emissions, checks render buffer for nonblank pixels, and verifies WebGPU validation errors are absent.

Live page: https://2rwa.github.io/hello-world-pages/gaussian-fluid-jacobian/
