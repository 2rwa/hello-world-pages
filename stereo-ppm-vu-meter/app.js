import {StereoPeakVuModel} from "./meter-core.mjs";

const $ = (selector) => document.querySelector(selector);
const model = new StereoPeakVuModel();

const ui = {
  status: $("#statusPill"), start: $("#startButton"), stop: $("#stopButton"), reset: $("#resetButton"),
  deviceName: $("#deviceName"), deviceInfo: $("#deviceInfo"), channelMode: $("#channelMode"),
  left: {
    ppmValue: $("#ppmLeftValue"), ppmTrack: $("#ppmLeftTrack"), ppmFill: $("#ppmLeftFill"), ppmHold: $("#ppmLeftHold"), clip: $("#clipLeft"),
    vuValue: $("#vuLeftValue"), vuTrack: $("#vuLeftTrack"), vuFill: $("#vuLeftFill"), vuDbfs: $("#vuLeftDbfs"),
    crest: $("#crestLeft"), crestFill: $("#crestLeftFill"),
  },
  right: {
    ppmValue: $("#ppmRightValue"), ppmTrack: $("#ppmRightTrack"), ppmFill: $("#ppmRightFill"), ppmHold: $("#ppmRightHold"), clip: $("#clipRight"),
    vuValue: $("#vuRightValue"), vuTrack: $("#vuRightTrack"), vuFill: $("#vuRightFill"), vuDbfs: $("#vuRightDbfs"),
    crest: $("#crestRight"), crestFill: $("#crestRightFill"),
  },
};

let stream = null;
let audioContext = null;
let source = null;
let splitter = null;
let analyserLeft = null;
let analyserRight = null;
let samplesLeft = null;
let samplesRight = null;
let raf = 0;
let lastFrameMs = performance.now();

function fmtDb(db, floor = -60) {
  if (!Number.isFinite(db) || db <= floor + 0.05) return `−${Math.abs(floor).toFixed(1)}`;
  return db.toFixed(1).replace("-", "−");
}
function fmtVu(vu) {
  if (!Number.isFinite(vu)) return "−20.0";
  const value = Math.max(-20, Math.min(3, vu));
  return (value > 0 ? "+" : "") + value.toFixed(1).replace("-", "−");
}
function setStatus(text, state) { ui.status.textContent = text; ui.status.dataset.state = state; }

function renderChannel(target, snapshot) {
  target.ppmValue.textContent = fmtDb(snapshot.ppm.displayDb);
  target.ppmFill.style.width = `${snapshot.ppm.displayPercent.toFixed(2)}%`;
  target.ppmHold.style.left = `${snapshot.ppm.holdPercent.toFixed(2)}%`;
  target.ppmTrack.setAttribute("aria-valuenow", snapshot.ppm.displayDb.toFixed(1));
  target.clip.classList.toggle("active", snapshot.ppm.clipped);
  target.clip.setAttribute("aria-pressed", snapshot.ppm.clipped ? "true" : "false");

  target.vuValue.textContent = fmtVu(snapshot.vu.vu);
  target.vuFill.style.width = `${snapshot.vu.percent.toFixed(2)}%`;
  target.vuTrack.setAttribute("aria-valuenow", snapshot.vu.vu.toFixed(1));
  target.vuDbfs.textContent = `${fmtDb(snapshot.vu.averageDb)} dBFS avg`;

  target.crest.textContent = `${snapshot.crestDb.toFixed(1)} dB`;
  target.crestFill.style.width = `${Math.min(100, snapshot.crestDb / 24 * 100).toFixed(1)}%`;
}
function render(snapshot = model.snapshot()) { renderChannel(ui.left, snapshot.left); renderChannel(ui.right, snapshot.right); }

function frame(now) {
  if (!analyserLeft || !analyserRight) return;
  analyserLeft.getFloatTimeDomainData(samplesLeft);
  analyserRight.getFloatTimeDomainData(samplesRight);
  const dt = Math.min(100, Math.max(0, now - lastFrameMs));
  lastFrameMs = now;
  render(model.update(samplesLeft, samplesRight, dt, now));
  raf = requestAnimationFrame(frame);
}

function makeAnalyser(context) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  return analyser;
}

async function start() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("UNSUPPORTED", "error");
    ui.deviceInfo.textContent = "このブラウザは getUserMedia() に対応していません。";
    return;
  }
  ui.start.disabled = true;
  setStatus("REQUESTING", "idle");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {channelCount: {ideal: 2}, echoCancellation: false, noiseSuppression: false, autoGainControl: false},
      video: false,
    });
    audioContext = new AudioContext({latencyHint: "interactive"});
    await audioContext.resume();
    source = audioContext.createMediaStreamSource(stream);
    analyserLeft = makeAnalyser(audioContext);
    analyserRight = makeAnalyser(audioContext);
    samplesLeft = new Float32Array(analyserLeft.fftSize);
    samplesRight = new Float32Array(analyserRight.fftSize);

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    const channelCount = Number(settings.channelCount || source.channelCount || 1);
    if (channelCount >= 2) {
      splitter = audioContext.createChannelSplitter(2);
      source.connect(splitter);
      splitter.connect(analyserLeft, 0);
      splitter.connect(analyserRight, 1);
      ui.channelMode.textContent = "STEREO L/R";
    } else {
      source.connect(analyserLeft);
      source.connect(analyserRight);
      ui.channelMode.textContent = "MONO → L/R";
    }

    ui.deviceName.textContent = track?.label || "Microphone";
    const details = [settings.sampleRate ? `${settings.sampleRate} Hz` : null, `${channelCount} ch input`].filter(Boolean);
    ui.deviceInfo.textContent = details.join(" / ");
    model.reset(); render();
    ui.stop.disabled = false;
    setStatus("LIVE", "live");
    lastFrameMs = performance.now();
    raf = requestAnimationFrame(frame);
  } catch (error) {
    stream = null;
    ui.start.disabled = false;
    setStatus("ERROR", "error");
    ui.deviceName.textContent = "マイクを開始できませんでした";
    ui.deviceInfo.textContent = error?.name === "NotAllowedError" ? "マイク利用が拒否されています。ブラウザのサイト権限を確認してください。" : String(error?.message || error);
  }
}

async function stop() {
  cancelAnimationFrame(raf); raf = 0;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null; source = null; splitter = null; analyserLeft = null; analyserRight = null; samplesLeft = null; samplesRight = null;
  if (audioContext && audioContext.state !== "closed") await audioContext.close();
  audioContext = null;
  ui.start.disabled = false; ui.stop.disabled = true;
  setStatus("IDLE", "idle");
  ui.deviceName.textContent = "マイク停止中"; ui.deviceInfo.textContent = "再開すると新しい入力ストリームを取得します。"; ui.channelMode.textContent = "—";
}

function resetPeaks() { model.resetPeaks(performance.now()); render(); }
ui.start.addEventListener("click", start);
ui.stop.addEventListener("click", stop);
ui.reset.addEventListener("click", resetPeaks);
ui.left.clip.addEventListener("click", resetPeaks);
ui.right.clip.addEventListener("click", resetPeaks);
window.addEventListener("pagehide", () => stream?.getTracks().forEach((track) => track.stop()));

function assert(condition, message) { if (!condition) throw new Error(message); }
function runCi() {
  const root = document.documentElement;
  try {
    const test = new StereoPeakVuModel({ppm: {attackMs: 0}, vu: {attackMs: 0, releaseMs: 0}});
    const left = new Float32Array([0, .5, -.5, .25, 0]);
    const right = new Float32Array([0, .25, -.25, .1, 0]);
    const first = test.update(left, right, 16, 100);
    render(first);
    assert(first.left.ppm.instantPeakDb > first.right.ppm.instantPeakDb + 5, "L/R PPM separation failed");
    assert(parseFloat(ui.left.ppmFill.style.width) > parseFloat(ui.right.ppmFill.style.width), "PPM UI did not reflect L/R difference");
    assert(parseFloat(ui.left.vuFill.style.width) > parseFloat(ui.right.vuFill.style.width), "VU UI did not reflect L/R difference");
    assert(ui.left.crest.textContent.includes("dB"), "crest readout missing");

    const clip = test.update(new Float32Array([1, 0]), new Float32Array([.2, 0]), 16, 116);
    render(clip);
    assert(ui.left.clip.classList.contains("active"), "left clip latch missing");
    assert(!ui.right.clip.classList.contains("active"), "right false clip");
    test.resetPeaks(120); render(test.snapshot());
    assert(!ui.left.clip.classList.contains("active"), "clip reset failed");

    root.dataset.ciStatus = "ok";
    root.dataset.ciChecks = "stereo-separation,ppm-ui,vu-ui,crest,clip-reset";
  } catch (error) {
    root.dataset.ciStatus = "error";
    root.dataset.ciError = String(error?.stack || error);
    console.error(error);
  }
}

render();
if (new URLSearchParams(location.search).has("ci")) runCi();
