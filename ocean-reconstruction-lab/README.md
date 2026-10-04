# Ocean Reconstruction Lab — Phase 2

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


## Phase 2: tropical shallow water

Phase 2 adds a continuous white-sand bathymetry that rises above mean sea level to become the beach. The terrain is rendered into an offscreen scene-color texture before the water pass.

The water pass then uses:

- screen-space refraction from the actual rendered sand scene
- water-column thickness derived from the spectral surface and analytic seabed
- Snell-law-based optical path approximation
- Beer–Lambert RGB attenuation
- blue-green in-scattering
- dielectric Fresnel reflection
- shallow-water wave damping and a small shoaling band
- shared depth so dry beach geometry correctly occludes water behind it

The shoreline is therefore geometry, not an alpha mask, and the sand seen through shallow water is the same terrain that continues onto the dry beach.


## Phase 2.1: surface-derived caustics

The submerged sand pass now reads the simulated GPU surface slope field. For neighboring surface samples it refracts the solar direction from air into water and projects those rays to the local seabed elevation. The 2x2 Jacobian determinant of that refracted footprint estimates local ray convergence/divergence:

- determinant < 1: rays converge, irradiance rises
- determinant > 1: rays diverge, irradiance falls

The result is depth-attenuated and bounded before modulating the submerged sand. This produces animated caustic focusing from the actual spectral wave field rather than from a tiled caustic texture or procedural noise.

Shallow-water sun glitter also uses a slightly lower microfacet roughness than deeper water, while retaining the same Fresnel/microfacet optical model.


## Phase 2.2: linear HDR optical transport

The scene prepass now renders sky and sand into an `rgba16float` linear-radiance texture. Refraction, Beer–Lambert attenuation, in-scattering and caustic modulation therefore operate in linear space. ACES-style tone mapping and display gamma are applied exactly once, after optical transport.

This removes the previous double tone-map / gamma-space attenuation error and makes shallow white sand, turquoise water and deeper blue-green water separate through transport rather than through arbitrary color overlays.


## Phase 2.3: refracted solar path to the seabed

Submerged sand lighting now includes the incoming light path, not only the camera/view path. The solar direction is refracted at the local simulated water normal, the optical path to the seabed is estimated, and the same wavelength-dependent absorption coefficients are applied to direct sunlight before the sand BRDF is evaluated.

The water therefore attenuates light twice in the physically expected places:

1. sun → refracted water column → seabed
2. seabed → refracted viewing path → camera

Caustic gain modulates the transmitted direct component, so focusing stays tied to the actual incident solar energy rather than becoming an arbitrary emissive pattern.


## Phase 2.4: depth-limited breaking / whitewater

Whitewater is now a separate optical state derived from the simulated surface rather than a shoreline texture.

The shader combines:

- local mean water depth from bathymetry
- target significant wave height
- the common depth-limited breaker idea that waves become unstable as H/h approaches the breaker range
- instantaneous positive crest elevation
- instantaneous surface steepness

Only locations that are shallow enough and currently carry a crest/steep surface receive an aerated-water coverage. That coverage increases roughness and shifts the local radiance toward highly scattering whitewater, while the surrounding water remains transparent and continues to use refraction + Beer–Lambert transport.


## Phase 2.5: multi-band short-wave slope spectrum

A second spectral band now covers approximately 0.46–1.34 Hz. It is generated from the wind-sea JONSWAP tail and directional spreading but normalized by a target **slope variance** rather than by significant wave height.

The target resolved short-wave slope variance is a controlled fraction of the Cox–Munk wind-speed slope variance. This avoids inventing an arbitrary normal-map strength:

- long/coarse band → actual displaced surface height and long-wave slopes
- short band → resolved optical slopes for normals, sun glitter, caustics and breaking steepness
- unresolved residual Cox–Munk variance → microfacet BRDF roughness

The short band does **not** displace geometry. It fades out of the explicit normal field with distance, while its unresolved energy remains represented statistically by the BRDF. This is the first near/mid/far transition toward geometry → normal statistics → BRDF statistics.


## Phase 2.6: shoreward propagation and persistent foam state

The beach coordinate system is now explicit: increasing offshore distance is +Z, so a UI direction of 0 degrees propagates waves toward the beach in -Z. The previous sign made the default sea travel offshore.

Whitewater is also no longer only an instantaneous fragment-shader classification. A dedicated GPU storage field is updated every simulation step:

- source: local depth-limited breaker condition + positive crest + steepness
- memory: previous foam coverage
- decay: exponential lifetime of about 4.2 s
- injection: breaker source integrated with frame delta time

The render pass reads this persistent state and combines it with a smaller instantaneous crest term. This keeps clear tropical water transparent between breakers while allowing recently broken waves to remain visibly aerated for several seconds.
