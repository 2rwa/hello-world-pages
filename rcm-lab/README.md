# RCM Synth Lab

A browser-based PCM-to-FM synthesis experiment inspired by Yamaha's RCM system in the SY77.

Live: https://2rwa.github.io/hello-world-pages/rcm-lab/

- Four modes: PCM-to-FM (RCM), FM only, PCM only, and parallel PCM+FM layer.
- 3-operator FM experiment, PCM pre-filter, output resonant low-pass, ADSR, eight-voice polyphony.
- Five procedurally generated PCM wavetables; user audio loading (first 2 seconds, looped with short fades, C4 tuning base).
- On-screen 24-note keyboard, computer keyboard, step demo, waveform visualization.
- Audio never leaves the browser; AudioWorklet requires a secure origin.

**Not** a SY77 emulator: no proprietary ROM, six-operator AFM algorithms, original DSP filters, or SY77 presets.

References: https://jp.yamaha.com/products/contents/music_production/synth_50th/history/chapter003.html
