# Glass Drift — WebGPU floating glass sphere on curved FFT sea

Live: https://2rwa.github.io/hello-world-pages/webgpu-floating-glass/

An independent ocean demo. The previous Curved FFT Ocean stays untouched.

## Rendering
- Reuse real 5-band JONSWAP-inspired ocean spectrum + WebGPU compute FFT from webgpu-fft-ocean-v3.
- Reuse the spherical ocean implicit surface and ray marching from webgpu-curved-fft-ocean. Avoid treating the wave implicit function as an exact SDF: bounded step + sign change + root bisection.
- Glass orb's x/z motion drifts slowly; its vertical center reads the same GPU FFT displacement texture as the rendered water. The sphere's immersion is controlled by a multiplier of sphere radius, not a physically resolved fluid/rigid-body solver.
- Analytic ray/sphere entry and exit, two Snell refractions, Schlick Fresnel, Beer-Lambert RGB absorption, sunlight highlights.
- The transmitted ray searches for the curved FFT water surface again after leaving the glass. The reflection uses the procedural sky.
- If the water intersection is closer than the orb, the water occludes the glass.
- UI options: glass radius, IOR, immersion, tint, ocean curvature, FFT amplitude, wind, foam, sun, eye altitude, debug render and FFT quality.

## Known limits
The ball follows the instantaneous local FFT wave height without velocity/inertia, angular rocking or proper Archimedes buoyancy. Glass reflection/refraction is two-interface geometric optics approximation (not recursive bounces). No caustic shadow or underwater volumetric light scattering. High-curvature water uses planar FFT x/z coordinates on a spherical base.

## Regression checks
Actions / headless Chrome SwiftShader validates actual FFT compute, WGSL compilation, GPU render, offscreen pixel readback, glass on/off image differences, radius, refractive index, immersion slider state and redraw.

## 100-ball / multi-bounce update
- Adjustable ball count 1–100, internal interface bounce budget 1–8, spatial spread and camera distance.
- GPU compute dispatch after the fifth inverse FFT creates a 100-slot storage buffer of centers and radii using the same five FFT textures as the ocean.
- The fragment shader analytically intersects up to 100 spheres and renders the nearest visible one; wave occlusion uses the original curved raymarch.
- Within a sphere each internal reflection can spawn a refracted exit sample with Beer-Lambert absorption, Fresnel weighting and FFT ocean intersection. The bounce slider limits these per-sphere optical boundary events. Cross-sphere secondary ray recursion is not currently traced.
- FPS is a rolling measurement of completed frames, not a claimed device benchmark.
- To view all 100 spheres, increase spread and camera distance.
- Regression checks: actual 100 sphere positions and varying wave heights, 100-vs-1 and 1-vs-8 visual differences, controls and FPS label.
