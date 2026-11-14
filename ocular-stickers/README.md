# Ocular sticker studio
WebGPU eye and liquid SDF from ../ocular-globe, rendered to an RGBA texture and read back into Canvas 2D. The overlay is deterministic and uses frame time, not wall clock. All 16 stickers share the same eye material.
- 01–08: agreement / nods
- 09–16: morning, acknowledgement, thanks, apology, surprise, stare, tired, celebration
- Canvas overlay can be disabled for clean renders; text remains.
- Noto Sans JP (OFL) is the default. Mac local Hiragino option is for local preview / export subject to applicable license; no font binary is distributed.
- APNG: 270x270, 20 frames, 100ms each, 2 loops; main 240x240 APNG; tab 96x74 PNG. ZIP contains 18 files. Export rejects >1MB APNG.
- CI tests real WebGPU readback, overlay changes, 16 APNGs and ZIP; CI uses installed Japanese fallback font, not Google Fonts network.

## Tear volume
Each expression has a separate default liquid radius (1.32–1.77 times the eye radius before motion). The per-sticker slider adjusts the thickness above the eye surface by 75–125%, not eye radius. The moving secondary liquid lobe is larger and has more lag. Framing uses conservative analytic projected bounds for the whole loop, reserving the caption and margins without per-frame camera zoom. Preview, PNG, APNG and ZIP use the same parameters. Slider values are retained while switching stickers in the current page session.
