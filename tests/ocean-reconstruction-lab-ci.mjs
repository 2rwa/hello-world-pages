import { spawn } from 'node:child_process';
import fs from 'node:fs';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromeBin = candidates.find((candidate) => fs.existsSync(candidate));
if (!chromeBin) throw new Error('Chrome/Chromium not found');

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
  '--window-size=960,540',
  '--user-data-dir=/tmp/ocean-reconstruction-lab-chrome',
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
      lastError = new Error(response.status + ' ' + response.statusText);
    } catch (errorValue) {
      lastError = errorValue;
    }
    await sleep(250);
  }
  throw lastError || new Error('Timed out waiting for ' + url);
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
  console.log('Browser:', versionInfo.Browser);

  const targetUrl = 'http://127.0.0.1:8000/ocean-reconstruction-lab/index.html?ci=1';
  const response = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(targetUrl), { method: 'PUT' });
  if (!response.ok) throw new Error('Could not create CDP target: ' + response.status);
  const targetInfo = await response.json();

  const cdp = connectCdp(targetInfo.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable');

  let state = null;
  for (let pollIndex = 0; pollIndex < 160; pollIndex += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: "JSON.stringify({stage:document.documentElement.dataset.testStage||'',error:document.documentElement.dataset.error||'',checksum:Number(document.documentElement.dataset.pixelChecksum||0),nonFlat:Number(document.documentElement.dataset.nonFlatCount||0),components:Number(document.documentElement.dataset.componentCount||0),queue:document.documentElement.dataset.gpuQueue||'',targetHs:document.documentElement.dataset.targetHs||'',phase:document.documentElement.dataset.oceanPhase||'',bathymetry:document.documentElement.dataset.whiteSandBathymetry||'',beer:document.documentElement.dataset.beerLambert||'',refraction:document.documentElement.dataset.sceneRefraction||'',caustics:document.documentElement.dataset.surfaceCaustics||'',linearHdr:document.documentElement.dataset.linearHdrTransport||'',solarPath:document.documentElement.dataset.underwaterSolarPath||'',whitewater:document.documentElement.dataset.whitewaterModel||'',multiBand:document.documentElement.dataset.multiBandOcean||'',fineComponents:Number(document.documentElement.dataset.fineComponentCount||0),direction:document.documentElement.dataset.waveDirection||'',foamState:document.documentElement.dataset.foamState||'',fineGrid:document.documentElement.dataset.fineGrid||'',coastalPhysics:document.documentElement.dataset.coastalWavePhysics||'',shoreLambda:Number(document.documentElement.dataset.shoreLambda||0),shoreKs:Number(document.documentElement.dataset.shoreKs||0)})",
      returnByValue: true,
    });
    if (result.result?.value) {
      state = JSON.parse(result.result.value);
      if (pollIndex % 8 === 0) console.log('state', state);
      if (state.stage === 'failed') throw new Error(state.error || 'Page reported failure');
      if (state.stage === 'ok') break;
    }
    await sleep(250);
  }

  if (!state || state.stage !== 'ok') throw new Error('Timed out: ' + JSON.stringify(state));
  if (state.queue !== 'done') throw new Error('GPU queue completion not observed');
  if (state.components < 200) throw new Error('Unexpected spectral component count: ' + state.components);
  if (state.checksum === 0 || state.nonFlat < 10) throw new Error('GPU image readback is flat or empty');
  if (!state.targetHs) throw new Error('Target Hs metadata missing');
  if (state.phase !== '2' || state.bathymetry !== 'true' || state.beer !== 'true' || state.refraction !== 'true' || state.caustics !== 'jacobian' || state.linearHdr !== 'rgba16float' || state.solarPath !== 'refracted-beer' || state.whitewater !== 'depth-limited-crest' || state.multiBand !== 'fine-slope-spectrum' || state.fineComponents < 60 || state.direction !== 'shoreward-minus-z' || state.foamState !== 'persistent-decay' || state.fineGrid !== '321x321-140m' || state.coastalPhysics !== 'snell-groupvelocity-lut' || state.shoreLambda <= 0 || state.shoreKs <= 0) {
    throw new Error('Phase 2 optical/bathymetry markers missing: ' + JSON.stringify(state));
  }

  console.log('validated', state);
  await sleep(250);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotBytes = Buffer.from(screenshot.data, 'base64');
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/ocean-reconstruction-lab-ci.png', screenshotBytes);
  console.log('Screenshot bytes:', screenshotBytes.length);
  if (screenshotBytes.length < 15000) throw new Error('Screenshot unexpectedly small');
  cdp.socket.close();
} catch (errorValue) {
  console.error(errorValue);
  console.error('--- Chrome stderr tail ---');
  console.error(stderrText.slice(-240000));
  process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM');
}
