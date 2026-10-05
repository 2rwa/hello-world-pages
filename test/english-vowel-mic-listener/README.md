# English Vowel Listener

Microphone-based General American vowel formant classifier.

## Categories

12 Hillenbrand et al. (1995) h-V-d categories:

- iy /i/ heed
- ih /ɪ/ hid
- ey /eɪ/ hayed
- eh /ɛ/ head
- ae /æ/ had
- ah /ɑ/ hod
- aw /ɔ/ hawed
- oa /oʊ/ hoed
- oo /ʊ/ hood
- uw /u/ who'd
- uh /ʌ/ hud
- er /ɝ/ heard

Reference F1/F2/F3 values are Table V means for 45 men and 48 women. The app exposes men, women, and the arithmetic adult mean as starting profiles. Per-vowel calibration replaces the selected profile point with the local speaker median.

Source:
Hillenbrand, J., Getty, L. A., Clark, M. J., & Wheeler, K. (1995).
"Acoustic characteristics of American English vowels."
Journal of the Acoustical Society of America 97(5), 3099–3111.

## Signal path

1. getUserMedia mono microphone input
2. roughly 75 ms frame, resampled to 12 kHz
3. DC removal + pre-emphasis + Hann window
4. 18th-order LPC using Levinson–Durbin
5. spectral-envelope peak picking for F1/F2/F3
6. Bark-distance classifier; /ɝ/ receives extra F3 weight
7. 7-frame vote smoothing for the displayed category

The /eɪ/ and /oʊ/ categories are diphthongs. This first version classifies the instantaneous/steady-state formant point; the plot trail visualizes spectral movement but the trajectory is not yet used as a sequence feature.

## Test

node --check test/english-vowel-mic-listener/app.mjs
node --check test/english-vowel-mic-listener/dsp.mjs
node --check test/english-vowel-mic-listener/plot.mjs
node test/english-vowel-mic-listener/test-dsp.mjs

The browser self-test checks rendering, 12 calibration cards, profile switching, threshold state updates, and the F1/F2 canvas.
