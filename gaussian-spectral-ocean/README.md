# Gaussian Spectral Ocean — an FFT-ocean alternative

https://2rwa.github.io/hello-world-pages/gaussian-spectral-ocean/

**Separate project.** The earlier Gaussian-fluid shallow-water demos, FFT ocean and particle experiments are unchanged.

The aim is to **reconstruct an ocean visually and kinematically comparable to FFT Ocean**, using direct Gaussian wave-packet synthesis rather than running FFT or the 2D shallow-water solver.

## Actual wave model

A wave packet is a spatial Gaussian envelope with a carrier of wavevector **k**:

h_i(x,t)=A_i exp(-|x-x_i(t)|²/(2σ_i²)) cos(k_i·x - ω_i t + φ_i)

The carrier vectors are deterministic, frequency-quantized for periodic tiles, and generated from directional Gaussian lobes around each band's dominant wavenumber. Each packet's envelope center travels with the deep-water group velocity.

- ω²=g|k|: deep-water gravity wave dispersion
- group velocity c_g=(1/2) √(g/|k|)
- 5 cascades: 2400, 610, 148, 35, 8 meters, 192² RGBA16F each
- 18 packets per cascade / 90 packets total
- wave displacement, horizontal orbital/choppy shift, surface derivatives and deformation Jacobian are all produced by the *same packet function* and written to GPU textures
- multi-band displaced GPU ocean mesh + fragment normal/roughness shading
- procedural sun/sky/clouds, Schlick Fresnel, water absorption and backscatter, and world-fixed RGBA foam history, Jacobian breaking onset with spatial lace noise
- no visually disconnected 3D spray, no independent cosmetic underwater bubble population

This is **not mathematically identical to JONSWAP FFT**: it is a finite coherent Gaussian packet approximation with relatively few wave modes. Realistic energetic spectra and large-scale statistical behavior depend on calibration. Wave trajectories are cinematic rather than a full SPH/Navier–Stokes treatment.

## CI

The headless GitHub Actions test runs actual WebGPU compute passes and displaced ocean mesh rendering under Chrome/SwiftShader, then reads GPU RGBA16F height, Jacobian, foam history and the RGBA8 framebuffer. Its assertions include wave-height range, spatially varying Jacobian, generated foam and a nonblank frame.
