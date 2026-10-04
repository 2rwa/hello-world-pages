import { spawn } from 'node:child_process';
import fs from 'node:fs';

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromeBin = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromeBin) throw new Error(`Chrome/Chromium not found: ${chromeCandidates.join(', ')}`);

const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=9222',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--disable-vulkan-fallback-to-gl-for-testing',
  '--use-webgpu-adapter=swiftshader',
  '--enable-webgpu-developer-features',
  '--enable-dawn-features=allow_unsafe_apis',
  '--disable-dawn-features=use_dxc',
  '--use-gpu-in-tests',
  '--enable-unsafe-swiftshader',
  '--window-size=960,640',
  '--user-data-dir=/tmp/webgpu-hybrid-shoreline-chrome',
  'about:blank',
];

const chrome = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let stderrText = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => {
  stderrText += chunk;
  if (stderrText.length > 240000) stderrText = stderrText.slice(-240000);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, attempts = 100) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (errorValue) {
      lastError = errorValue;
    }
    await sleep(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    socket,
    opened,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

try {
  const versionInfo = await fetchJsonWithRetry('http://127.0.0.1:9222/json/version');
  console.log(`Browser: ${versionInfo.Browser}`);

  const url = 'http://127.0.0.1:8000/webgpu-hybrid-shoreline/index.html?ci=1';
  const createResponse = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!createResponse.ok) throw new Error(`Could not create CDP target: ${createResponse.status}`);
  const targetInfo = await createResponse.json();

  const cdp = connectCdp(targetInfo.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  let finalState = null;
  for (let pollIndex = 0; pollIndex < 180; pollIndex += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        stage: document.documentElement.dataset.testStage || '',
        error: document.documentElement.dataset.error || '',
        backend: document.documentElement.dataset.backend || '',
        frameCount: Number(document.documentElement.dataset.frameCount || 0),
        gpuQueue: document.documentElement.dataset.gpuQueue || '',
        rasterScene: document.documentElement.dataset.rasterScene || '',
        depthRefraction: document.documentElement.dataset.depthRefraction || '',
        selectiveRaymarch: document.documentElement.dataset.selectiveRaymarch || '',
        uiRevision: Number(document.documentElement.dataset.uiRevision || 0),
        pixelLength: Number(document.documentElement.dataset.pixelLength || 0),
        pixelChecksum: Number(document.documentElement.dataset.pixelChecksum || 0)
      })`,
      returnByValue: true,
    });

    const raw = result.result?.value;
    if (raw) {
      finalState = JSON.parse(raw);
      if (pollIndex % 8 === 0) console.log('state', finalState);
      if (finalState.stage === 'failed') throw new Error(finalState.error || 'Page reported failure');
      if (finalState.stage === 'ok' && finalState.frameCount >= 1) break;
    }
    await sleep(250);
  }

  if (!finalState || finalState.stage !== 'ok') {
    throw new Error(`Timed out waiting for rendered ok state: ${JSON.stringify(finalState)}`);
  }
  if (!finalState.backend.toLowerCase().includes('webgpu')) throw new Error(`Unexpected backend: ${finalState.backend}`);
  if (finalState.gpuQueue !== 'done') throw new Error('GPU queue completion was not observed');
  if (finalState.pixelLength < 256 * 160 * 4 || finalState.pixelChecksum === 0) {
    throw new Error(`Three.js offscreen readback invalid: ${JSON.stringify(finalState)}`);
  }
  if (finalState.rasterScene !== 'true' || finalState.depthRefraction !== 'true') throw new Error('Hybrid raster/depth flags missing');
  if (finalState.selectiveRaymarch !== '12-step-volume') throw new Error('Selective raymarch marker missing');

  const uiResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const before = Number(document.documentElement.dataset.uiRevision || 0);
      const clarity = document.getElementById('clarity');
      const refraction = document.getElementById('refraction');
      const raymarch = document.getElementById('raymarch');
      clarity.value = '0.75';
      clarity.dispatchEvent(new Event('input', { bubbles: true }));
      refraction.value = '0.018';
      refraction.dispatchEvent(new Event('input', { bubbles: true }));
      raymarch.value = '0';
      raymarch.dispatchEvent(new Event('input', { bubbles: true }));
      return JSON.stringify({
        before,
        after: Number(document.documentElement.dataset.uiRevision || 0),
        clarity: document.documentElement.dataset.clarity,
        refraction: document.documentElement.dataset.refraction,
        raymarch: document.documentElement.dataset.raymarch
      });
    })()`,
    returnByValue: true,
  });

  const uiState = JSON.parse(uiResult.result.value);
  console.log('ui-state', uiState);
  if (uiState.after < uiState.before + 3) throw new Error('UI listeners did not update revision');
  if (uiState.clarity !== '0.75' || uiState.refraction !== '0.018' || uiState.raymarch !== '0') {
    throw new Error(`UI state did not propagate: ${JSON.stringify(uiState)}`);
  }

  await sleep(500);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotBytes = Buffer.from(screenshot.data, 'base64');
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/webgpu-hybrid-shoreline-ci.png', screenshotBytes);
  console.log(`Screenshot bytes: ${screenshotBytes.length}`);
  if (screenshotBytes.length < 15000) throw new Error('Screenshot was unexpectedly small');

  cdp.socket.close();
} catch (errorValue) {
  console.error(errorValue);
  console.error('--- Chrome stderr tail ---');
  console.error(stderrText.slice(-240000));
  process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM');
}
