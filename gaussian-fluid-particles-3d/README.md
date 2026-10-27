# Gaussian Fluid / 3D Bubbles & Spray

**Independent** WebGPU ocean experiment; earlier Gaussian Fluid, Jacobian and Foam Evolution folders remain untouched.

Demo: https://2rwa.github.io/hello-world-pages/gaussian-fluid-particles-3d/

## Pipeline

1. 384 moving Gaussian pressure kernels drive 160×160 shallow-water velocity and height
2. Jacobian area compression controls breaking and four separate foam history channels
3. 1536 separate GPU 3D particles are spawned in wave-breaking/foamy world regions
   - **768 buoyant air bubbles**: underwater initial placement, upward lift, lateral flow, 3D wobble, terminate when reaching the waterline
   - **768 ballistic spray droplets**: spawn just over the wave crest with randomized upward impulse, fall under gravity and wind drag, terminate on water contact
4. Camera-facing spherical impostors project **3D world positions** with correct depth perspective. Bubbles have refractive Fresnel rims and glints; spray droplets have tiny translucent specular highlights.
5. The particle layer is alpha-composited over the existing ocean render; controls adjust bubble/spray amounts, particle size, and buoyancy/impulse.
6. Debug modes include an isolated particle-only visualization on dark background.

Implementation caveat: the spheres are **billboard impostors with 3D motion**, not volumetric ray-traced spheres. Subsurface bubbles are composited through the surface with simplified optical attenuation; the demo does not implement rigorous depth sorting, subsurface transmission/refraction, or splash-to-foam mass coupling.

## Tests

GitHub Actions starts Chrome using SwiftShader WebGPU, compiles all production WGSL (including particle compute and render shaders), runs 48 simulation frames, reads back field/deformation/RGBA foam/3D particle state, verifies below- and above-water particles and perspective-visible examples, then compares offscreen images with sprites enabled and disabled.
