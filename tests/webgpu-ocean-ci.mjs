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
if (!chromeBin) throw new Error(`Chrome/Chromium not found. Tried: ${chromeCandidates.join(', ')}`);

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
  '--user-data-dir=/tmp/webgpu-ocean-chrome',
  'about:blank',
];

const chromeProcess = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let stderrText = '';
chromeProcess.stderr.setEncoding('utf8');
chromeProcess.stderr.on('data', (chunk) => {
  stderrText += chunk;
  if (stderrText.length > 200000) stderrText = stderrText.slice(-200000);
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitForJson(url, attempts = 80) {
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
  const versionInfo = await waitForJson('http://127.0.0.1:9222/json/version');
  console.log(`Browser: ${versionInfo.Browser}`);
  const createResponse = await fetch('http://127.0.0.1:9222/json/new?http://127.0.0.1:8000/webgpu-ocean-raymarch/index.html?ci=1', { method: 'PUT' });
  if (!createResponse.ok) throw new Error(`Could not create CDP target: ${createResponse.status}`);
  const targetInfo = await createResponse.json();
  const cdp = connectCdp(targetInfo.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Runtime.enable');

  let lastStage = 'unknown';
  let lastError = '';
  let pixelSum = '';
  for (let pollIndex = 0; pollIndex < 120; pollIndex += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({stage: document.documentElement.dataset.webgpuTest || '', error: document.documentElement.dataset.webgpuError || '', pixel: document.documentElement.dataset.webgpuPixelSum || ''})`,
      returnByValue: true,
    });
    const payloadText = result.result?.value;
    if (payloadText) {
      const payload = JSON.parse(payloadText);
      if (payload.stage && payload.stage !== lastStage) {
        lastStage = payload.stage;
        console.log(`WebGPU stage: ${lastStage}`);
      }
      lastError = payload.error || lastError;
      pixelSum = payload.pixel || pixelSum;
      if (lastStage === 'ok') {
        console.log(`Readback center pixel sum: ${pixelSum}`);
        cdp.socket.close();
        process.exitCode = 0;
        break;
      }
      if (lastStage === 'failed') throw new Error(lastError || 'Page reported WebGPU failure');
    }
    await sleep(250);
  }
  if (lastStage !== 'ok') throw new Error(`Timed out waiting for WebGPU completion; last stage=${lastStage}; ${lastError}`);
} catch (errorValue) {
  console.error(errorValue);
  console.error('--- Chrome stderr tail ---');
  console.error(stderrText.slice(-20000));
  process.exitCode = 1;
} finally {
  chromeProcess.kill('SIGTERM');
}
