import {PeakProgramMeterModel} from "./meter-core.mjs";

const $ = (s) => document.querySelector(s);
const model = new PeakProgramMeterModel();

const ui = {
  status: $("#statusPill"),
  ppm: $("#ppmValue"),
  instant: $("#instantValue"),
  rms: $("#rmsValue"),
  hold: $("#holdValue"),
  fill: $("#meterFill"),
  marker: $("#holdMarker"),
  track: $("#meterTrack"),
  clip: $("#clipLamp"),
  start: $("#startButton"),
  stop: $("#stopButton"),
  reset: $("#resetButton"),
  deviceName: $("#deviceName"),
  deviceInfo: $("#deviceInfo"),
};

let stream = null;
let audioContext = null;
let analyser = null;
let samples = null;
let raf = 0;
let lastFrameMs = performance.now();

function fmt(db) {
  if (!Number.isFinite(db) || db <= -59.95) return "−60.0";
  return db.toFixed(1).replace("-", "−");
}

function render(snapshot = model.snapshot()) {
  ui.ppm.textContent = fmt(snapshot.displayDb);
  ui.instant.textContent = `${fmt(snapshot.instantPeakDb)} dBFS`;
  ui.rms.textContent = `${fmt(snapshot.rmsDb)} dBFS`;
  ui.hold.textContent = `${fmt(snapshot.holdDb)} dBFS`;
  ui.fill.style.width = `${snapshot.displayPercent.toFixed(2)}%`;
  ui.marker.style.left = `${snapshot.holdPercent.toFixed(2)}%`;
  ui.track.setAttribute("aria-valuenow", snapshot.displayDb.toFixed(1));
  ui.clip.classList.toggle("active", snapshot.clipped);
  ui.clip.setAttribute("aria-pressed", snapshot.clipped ? "true" : "false");
}

function setStatus(text, state) {
  ui.status.textContent = text;
  ui.status.dataset.state = state;
}

function frame(now) {
  if (!analyser || !samples) return;
  analyser.getFloatTimeDomainData(samples);
  const dt = Math.min(100, Math.max(0, now - lastFrameMs));
  lastFrameMs = now;
  render(model.update(samples, dt, now));
  raf = requestAnimationFrame(frame);
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
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    audioContext = new AudioContext({latencyHint: "interactive"});
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    samples = new Float32Array(analyser.fftSize);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    ui.deviceName.textContent = track?.label || "Microphone";
    const details = [settings.sampleRate ? `${settings.sampleRate} Hz` : null, settings.channelCount ? `${settings.channelCount} ch` : "mono mix"].filter(Boolean);
    ui.deviceInfo.textContent = details.join(" / ") || "Web Audio API input";

    model.reset();
    render();
    ui.stop.disabled = false;
    setStatus("LIVE", "live");
    lastFrameMs = performance.now();
    raf = requestAnimationFrame(frame);
  } catch (error) {
    stream = null;
    setStatus("ERROR", "error");
    ui.deviceName.textContent = "マイクを開始できませんでした";
    ui.deviceInfo.textContent = error?.name === "NotAllowedError" ? "マイク利用が拒否されています。ブラウザのサイト権限を確認してください。" : String(error?.message || error);
    ui.start.disabled = false;
  }
}

async function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  analyser = null;
  samples = null;
  if (audioContext && audioContext.state !== "closed") await audioContext.close();
  audioContext = null;
  ui.start.disabled = false;
  ui.stop.disabled = true;
  setStatus("IDLE", "idle");
  ui.deviceName.textContent = "マイク停止中";
  ui.deviceInfo.textContent = "再開すると新しい入力ストリームを取得します。";
}

function resetPeak() {
  model.resetPeak(performance.now());
  render();
}

ui.start.addEventListener("click", start);
ui.stop.addEventListener("click", stop);
ui.reset.addEventListener("click", resetPeak);
ui.clip.addEventListener("click", resetPeak);
window.addEventListener("pagehide", () => { stream?.getTracks().forEach((track) => track.stop()); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCi() {
  const root = document.documentElement;
  try {
    const testModel = new PeakProgramMeterModel({attackMs: 0, releaseMs: 1000});
    const tone = new Float32Array([0, 0.5, -0.25, 0.1, -0.5, 0]);
    const first = testModel.update(tone, 16, 100);
    assert(first.instantPeakDb > -6.1 && first.instantPeakDb < -6.0, "peak dBFS conversion failed");
    render(first);
    assert(parseFloat(ui.fill.style.width) > 80, "meter fill did not redraw");
    assert(ui.instant.textContent.includes("dBFS"), "numeric readout missing");

    const clipped = testModel.update(new Float32Array([1, -1, 0]), 16, 116);
    render(clipped);
    assert(ui.clip.classList.contains("active"), "clip latch did not redraw");
    testModel.resetPeak(120);
    render(testModel.snapshot());
    assert(!ui.clip.classList.contains("active"), "clip reset did not redraw");

    root.dataset.ciStatus = "ok";
    root.dataset.ciChecks = "dbfs,ppm-ui,peak-hold,clip-reset";
  } catch (error) {
    root.dataset.ciStatus = "error";
    root.dataset.ciError = String(error?.stack || error);
    console.error(error);
  }
}

render();
if (new URLSearchParams(location.search).has("ci")) runCi();
