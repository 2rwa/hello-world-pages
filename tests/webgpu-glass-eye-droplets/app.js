const canvas = document.querySelector('#gpu');
const statusEl = document.querySelector('#status');
const amountEl = document.querySelector('#amount');
const flatteningEl = document.querySelector('#flattening');
const frequencyEl = document.querySelector('#frequency');
const dropletCountEl = document.querySelector('#dropletCount');
const dropletSizeEl = document.querySelector('#dropletSize');
const dropletBulgeEl = document.querySelector('#dropletBulge');
const waterIorEl = document.querySelector('#waterIor');
const glassIorEl = document.querySelector('#glassIor');
const amountOut = document.querySelector('#amountOut');
const flatteningOut = document.querySelector('#flatteningOut');
const frequencyOut = document.querySelector('#frequencyOut');
const dropletCountOut = document.querySelector('#dropletCountOut');
const dropletSizeOut = document.querySelector('#dropletSizeOut');
const dropletBulgeOut = document.querySelector('#dropletBulgeOut');
const waterIorOut = document.querySelector('#waterIorOut');
const glassIorOut = document.querySelector('#glassIorOut');
const descEl = document.querySelector('#desc');
const ciMode = new URLSearchParams(location.search).get('ci') === '1';

const descriptions = [
  'Original: 球〜楕円体の目玉へ水滴を載せた基準状態。中央の大きめの滴では虹彩がレンズ状に歪みます。',
  'Twist: 楕円断面をねじりながら、水滴も同じ逆変形座標で表面へ追従させます。',
  'Bend: 目玉全体の湾曲に合わせ、水滴の位置と法線も一緒に曲がります。',
  'Taper: 前後方向の先細り／末広がりに合わせて、水滴の配置も追従します。',
  'Shear: ガラス目玉を斜めにずらしても、水滴だけが置いていかれないことを確認できます。',
  'Stretch: 中央付近を局所伸縮し、水滴込みで柔らかい透明体のように変形します。',
  'Domain warp: 非SDF変形を安全係数付きmarchで追跡。水滴もゆっくり歪む異質な濡れ表現になります。'
];

let modeCode = 0;
let yawValue = 0.0;
let pitchValue = 0.05;
let paused = false;
let heldTime = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;

function setStatus(textValue, stateValue='boot'){
  statusEl.textContent = textValue;
  statusEl.dataset.state = stateValue;
}

function syncOutputs(){
  amountOut.textContent = Number(amountEl.value).toFixed(2);
  flatteningOut.textContent = Number(flatteningEl.value).toFixed(2);
  frequencyOut.textContent = Number(frequencyEl.value).toFixed(1);
  dropletCountOut.textContent = String(Math.round(Number(dropletCountEl.value)));
  dropletSizeOut.textContent = Number(dropletSizeEl.value).toFixed(2);
  dropletBulgeOut.textContent = Number(dropletBulgeEl.value).toFixed(2);
  waterIorOut.textContent = Number(waterIorEl.value).toFixed(3);
  glassIorOut.textContent = Number(glassIorEl.value).toFixed(2);
}
syncOutputs();

function selectMode(modeValue){
  modeCode = modeValue;
  document.querySelectorAll('button[data-mode]').forEach((node) => {
    node.classList.toggle('active', Number(node.dataset.mode) === modeCode);
  });
  descEl.textContent = descriptions[modeCode];
}

document.querySelector('#modes').addEventListener('click', (event) => {
  const buttonEl = event.target.closest('button[data-mode]');
  if (!buttonEl) return;
  selectMode(Number(buttonEl.dataset.mode));
});

for (const inputEl of [amountEl, flatteningEl, frequencyEl, dropletCountEl, dropletSizeEl, dropletBulgeEl, waterIorEl, glassIorEl]) {
  inputEl.addEventListener('input', syncOutputs);
}

document.querySelector('#resetView').addEventListener('click', () => { yawValue = 0; pitchValue = 0.05; });
document.querySelector('#pauseAnim').addEventListener('click', (event) => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'warp resume' : 'warp pause';
});
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yawValue += (event.clientX - lastX) * 0.008;
  pitchValue = Math.max(-1.0, Math.min(1.0, pitchValue + (event.clientY - lastY) * 0.006));
  lastX = event.clientX;
  lastY = event.clientY;
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

function runUiRegression(){
  const twistButton = document.querySelector('button[data-mode="1"]');
  twistButton.click();
  if (modeCode !== 1 || !twistButton.classList.contains('active') || !descEl.textContent.startsWith('Twist:')) {
    throw new Error('UI regression: mode selection did not update state');
  }
  dropletCountEl.value = '12';
  dropletSizeEl.value = '1.14';
  dropletBulgeEl.value = '0.54';
  for (const inputEl of [dropletCountEl, dropletSizeEl, dropletBulgeEl]) {
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (dropletCountOut.textContent !== '12' || dropletSizeOut.textContent !== '1.14' || dropletBulgeOut.textContent !== '0.54') {
    throw new Error('UI regression: droplet controls did not update outputs');
  }
}

const shaderCode = await fetch('./shader.wgsl').then((response) => {
  if (!response.ok) throw new Error(`shader fetch failed: ${response.status}`);
  return response.text();
});

async function main(){
  try {
    if (ciMode) runUiRegression();
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    setStatus('adapter…');
    const gpuAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!gpuAdapter) throw new Error('requestAdapter() returned null');

    setStatus('device…');
    const gpuDevice = await gpuAdapter.requestDevice();
    gpuDevice.lost.then((info) => {
      setStatus(`device lost: ${info.reason || 'unknown'} ${info.message || ''}`, 'error');
    });

    setStatus('shader…');
    const shaderModule = gpuDevice.createShaderModule({ code: shaderCode });
    const compilationInfo = await shaderModule.getCompilationInfo();
    const shaderErrors = compilationInfo.messages.filter((message) => message.type === 'error');
    if (shaderErrors.length) {
      throw new Error(shaderErrors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
    }

    const uniformBuffer = gpuDevice.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    function createPipeline(surfaceFormat){
      return gpuDevice.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertexMain' },
        fragment: { module: shaderModule, entryPoint: 'fragmentMain', targets: [{ format: surfaceFormat }] },
        primitive: { topology: 'triangle-list' },
      });
    }

    function createBindGroup(renderPipeline){
      return gpuDevice.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
    }

    function writeUniforms(widthValue, heightValue, timeValue){
      const values = new Float32Array([
        widthValue, heightValue, timeValue, 0,
        modeCode, Number(amountEl.value), Number(frequencyEl.value), Number(glassIorEl.value),
        yawValue, pitchValue, Number(flatteningEl.value), 0,
        Number(dropletCountEl.value), Number(dropletSizeEl.value), Number(dropletBulgeEl.value), Number(waterIorEl.value),
      ]);
      gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);
    }

    function encodeRender(renderPipeline, bindGroup, textureView){
      const commandEncoder = gpuDevice.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.012, g: 0.018, b: 0.019, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(3, 1, 0, 0);
      renderPass.end();
      return commandEncoder;
    }

    if (ciMode) {
      setStatus('pipeline…');
      gpuDevice.pushErrorScope('validation');
      const ciFormat = 'rgba8unorm';
      const renderPipeline = createPipeline(ciFormat);
      const bindGroup = createBindGroup(renderPipeline);
      const textureSize = 96;
      const bytesPerRow = 256 * Math.ceil((textureSize * 4) / 256);
      const offscreenTexture = gpuDevice.createTexture({
        size: [textureSize, textureSize, 1],
        format: ciFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const readbackBuffer = gpuDevice.createBuffer({
        size: bytesPerRow * textureSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      amountEl.value = '0.68';
      flatteningEl.value = '0.24';
      waterIorEl.value = '1.333';
      syncOutputs();
      writeUniforms(textureSize, textureSize, 0.75);

      const commandEncoder = encodeRender(renderPipeline, bindGroup, offscreenTexture.createView());
      commandEncoder.copyTextureToBuffer(
        { texture: offscreenTexture },
        { buffer: readbackBuffer, bytesPerRow, rowsPerImage: textureSize },
        [textureSize, textureSize, 1]
      );
      gpuDevice.queue.submit([commandEncoder.finish()]);
      setStatus('submitted…');
      await gpuDevice.queue.onSubmittedWorkDone();
      const validationError = await gpuDevice.popErrorScope();
      if (validationError) throw new Error(`validation: ${validationError.message}`);

      setStatus('readback…');
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const pixels = new Uint8Array(readbackBuffer.getMappedRange());
      let checksumValue = 0;
      let brightSamples = 0;
      for (let indexValue = 0; indexValue < pixels.length; indexValue += 113) {
        checksumValue = (checksumValue + pixels[indexValue]) >>> 0;
        if (pixels[indexValue] > 100) brightSamples += 1;
      }
      readbackBuffer.unmap();
      if (checksumValue === 0 || brightSamples === 0) throw new Error('render readback did not contain visible output');
      setStatus(`ok · droplets checksum ${checksumValue}`, 'ok');
      document.body.dataset.ci = 'ok';
      return;
    }

    const gpuContext = canvas.getContext('webgpu');
    if (!gpuContext) throw new Error('webgpu canvas context unavailable');
    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat();
    gpuContext.configure({ device: gpuDevice, format: surfaceFormat, alphaMode: 'opaque' });

    setStatus('pipeline…');
    gpuDevice.pushErrorScope('validation');
    const renderPipeline = createPipeline(surfaceFormat);
    const bindGroup = createBindGroup(renderPipeline);

    function resizeCanvas(){
      const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
      const displayWidth = Math.max(1, Math.floor(innerWidth * pixelRatio));
      const displayHeight = Math.max(1, Math.floor(innerHeight * pixelRatio));
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
    }

    resizeCanvas();
    writeUniforms(canvas.width, canvas.height, 0.2);
    {
      const firstEncoder = encodeRender(renderPipeline, bindGroup, gpuContext.getCurrentTexture().createView());
      gpuDevice.queue.submit([firstEncoder.finish()]);
      await gpuDevice.queue.onSubmittedWorkDone();
      const validationError = await gpuDevice.popErrorScope();
      if (validationError) throw new Error(`validation: ${validationError.message}`);
    }
    setStatus('ok', 'ok');

    const startTime = performance.now();
    function frame(nowValue){
      resizeCanvas();
      if (!paused) heldTime = (nowValue - startTime) * 0.001;
      writeUniforms(canvas.width, canvas.height, heldTime);
      const commandEncoder = encodeRender(renderPipeline, bindGroup, gpuContext.getCurrentTexture().createView());
      gpuDevice.queue.submit([commandEncoder.finish()]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (errorValue) {
    console.error(errorValue);
    document.body.dataset.ci = 'error';
    setStatus(String(errorValue?.message || errorValue), 'error');
  }
}
main();
