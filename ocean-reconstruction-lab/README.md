# Ocean Reconstruction Lab — Phase 1

A clean-room WebGPU ocean experiment focused on measurable wave statistics rather than game-water effects.

## Current model

The visible surface is generated from two independent stochastic wave systems:

1. wind sea
2. swell

Each system uses a JONSWAP-shaped one-dimensional frequency spectrum, a TMA-style finite-depth attenuation factor, and frequency-dependent cosine-power directional spreading. The raw spectrum is numerically renormalized so that

```
m0 = Hs^2 / 16
```

for the requested significant wave height. Each discrete directional-frequency bin becomes one linear Airy component with amplitude

```
A = sqrt(2 * S(f) * D(f,theta) * df * dtheta)
```

and finite-depth dispersion

```
omega^2 = g k tanh(k h)
```

where `k` is solved numerically.

The default build uses 14 frequency bins x 8 direction bins for each of two systems, for 224 spectral components total.

## GPU path

A raw WebGPU compute pass reconstructs, at every surface grid sample:

- surface elevation
- x slope
- z slope

from the complete component set. The render pass reads that storage buffer directly in the vertex stage.

There is intentionally no:

- Voronoi water noise
- foam texture
- hand-authored crest mask
- decorative rocks or beach
- fake caustic texture

Phase 1 is open ocean only.

## Optical rendering

The renderer currently uses:

- dielectric Fresnel with water F0 near 0.020
- analytic sky/horizon radiance
- direct sun disk and sun glitter
- a microfacet roughness term derived from a Cox-Munk-style wind-speed slope variance
- distance atmospheric blending

This optical layer is intentionally incomplete. Spectral water absorption/scattering and physically generated foam are later phases.

## Validation

A virtual buoy reads the center sample back from the GPU surface buffer.

The browser estimates:

- observed significant wave height: `4 * standard deviation(eta)`
- mean zero-upcrossing period

The small spectrum plot shows the target wind-sea, swell, and total one-dimensional spectra.

GitHub Actions uses Chrome + SwiftShader WebGPU and verifies the real compute + render path offscreen, including:

- adapter/device creation
- WGSL compilation info
- async compute/render pipeline creation
- compute dispatch
- indexed ocean draw
- validation error scope
- queue completion
- texture-to-buffer pixel readback
- non-flat image checksum

## Why direct spectral synthesis first?

This first implementation does not yet use an inverse FFT. Direct component summation is intentionally easier to audit: every frequency-direction bin maps directly to a visible component and the integrated energy can be checked against Hs. Once statistical validation is stable, the same spectrum can be moved to a multi-band FFT implementation without changing the target sea state.

## Next phases

1. compare reconstructed buoy spectrum against the target directional spectrum
2. multi-band GPU FFT
3. spatially varying wave trains / bathymetry
4. shoaling, refraction, reflection and diffraction
5. topology-changing breaking waves
6. bubbles / wet foam / spray as separate states
7. spectral underwater transport
8. generated caustics
9. near/mid/far transition from geometry to normal statistics to BRDF statistics

## References used for Phase 1

- Hasselmann et al., JONSWAP spectrum family
- Bouws et al., TMA shallow-water spectrum family
- Mitsuyasu-style cosine-power directional spreading
- finite-depth Airy dispersion relation
- Cox & Munk wind-driven sea-surface slope statistics

Useful modern context:
- Dynamic Wave Trains for Real-Time Water Simulation, Computer Graphics Forum, 2026
- Physically accurate real-time synthesis of ocean waves for maritime simulators, Ocean Engineering, 2024
- Real-Time Underwater Spectral Rendering, Computer Graphics Forum, 2024
- Pahi: A Large-Scale Simulation and Rendering System for Water, Weta FX, 2023
