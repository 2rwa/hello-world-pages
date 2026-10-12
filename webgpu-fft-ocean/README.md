# FFT Ocean WebGPU

WebGPU-only experiment with five cascaded spectral ocean tiles, calculated on the GPU using
separate compute passes for Fourier spectrum evolution, inverse FFT rows and columns.

Implemented: 5 bands of 2003/433/97/23.3/5.3 m, configurable 128²/256²/512²,
JONSWAP-inspired directional wind spectrum plus long-period swell, adjustable 2.8x amplitude,
height and horizontal displacement, Jacobian whitecaps, normal/moment mipmaps,
Schlick Fresnel F0=0.02, simplified absorption/backscatter water optics,
420m/3.2km persistent foam clipmaps (world-space reprojection), Kelvin-angle wake,
27-point GPU wave-height probe readback, orbit controls, steerable floating sphere,
offscreen mode (?ci=1) to validate the same GPU pipelines.

Not yet implemented: actual HDRI/planar reflection, true LEADR, calibrated Monahan
coverage, dedicated spray particles, two separate wake RT families, photographic foam
texture, real ship 3D model. Physical values are approximate; this is a WebGPU proof of
concept rather than a full port of GodotOceanWaves.

The GitHub Pages demo runs on HTTPS. For constrained GPUs select the 128² mode.
