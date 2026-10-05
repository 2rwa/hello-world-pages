# Prismatic Crystal Dice

WebGPU raymarch demo.

- Clear refractive crystal die with bump-mapped normals
- Result-driven rainbow aura: the roll value controls the number/phase of spectral strands
- Rainbow texture is used primarily by the surrounding aura rather than tinting the crystal body
- Web Audio fanfare varies by result
- CI validates WGSL compilation, offscreen rendering/readback, roll state, and visual-control redraws
