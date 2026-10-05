const canvas = document.querySelector('#gpu');
const statusEl = document.querySelector('#status');
const strengthEl = document.querySelector('#strength');
const scaleEl = document.querySelector('#scale');
const speedEl = document.querySelector('#speed');
const directionEl = document.querySelector('#direction');
const iorEl = document.querySelector('#ior');
const strengthOut = document.querySelector('#strengthOut');
const scaleOut = document.querySelector('#scaleOut');
const speedOut = document.querySelector('#speedOut');
const directionOut = document.querySelector('#directionOut');
const iorOut = document.querySelector('#iorOut');
const descEl = document.querySelector('#desc');
const ciMode = new URLSearchParams(location.search).get('ci') === '1';

const descriptions = [
  'Calm: バンプを無効化した基準状態です。球の通常法線だけで反射・屈折を計算します。',
  'Stream: 球面上の複数の位相波を時間方向へ流し、ガラスの反射と屈折を水膜のように移動させます。',
  'Iris swirl: 瞳孔を中心とする角度成分と球面深度を組み合わせ、虹彩の周囲を旋回する流れを作ります。',
  'Spherical ripple: 球面上の一点から測った角距離を使い、表面を伝播する波紋として法線を揺らします。',
  'Mixed flow: stream・swirl・細かい交差波を重ね、方向性を残しつつ複雑な液膜状の流れにします。'
];

let modeCode = 1;
let yawValue = 0.0;
let pitchValue = 0.05;
let pausedFlag = false;
let heldTime = 0;
let draggingFlag = false;
let previousX = 0;
let previousY = 0;

function setStatus(textValue, stateValue = 'boot') {
  statusEl.textContent = textValue;
  statusEl.dataset.state = stateValue;
}

function syncOutputs() {
  strengthOut.textContent = Number(strengthEl.value).toFixed(2);
  scaleOut.textContent = Number(scaleEl.value).toFixed(1);
  speedOut.textContent = Number(speedEl.value).toFixed(2);
  directionOut.textContent = Math.round(Number(directionEl.value)) + '°';
  iorOut.textContent = Number(iorEl.value).toFixed(2);
}
syncOutputs();

document.querySelector('#modes').addEventListener('click', (event) => {
  const buttonEl = event.target.closest('button[data-mode]');
  if (!buttonEl) return;
  modeCode = Number(buttonEl.dataset.mode);
  document.querySelectorAll('button[data-mode]').forEach((node) => {
    node.classList.toggle('active', node === buttonEl);
  });
  descEl.textContent = descriptions[modeCode];
});

for (const inputEl of [strengthEl, scaleEl, speedEl, directionEl, iorEl]) {
  inputEl.addEventListener('input', syncOutputs);
}

document.querySelector('#resetView').addEventListener('click', () => {
  yawValue = 0.0;
  pitchValue = 0.05;
});

document.querySelector('#pauseAnim').addEventListener('click', (event) => {
  pausedFlag = !pausedFlag;
  event.currentTarget.textContent = pausedFlag ? 'resume flow' : 'pause flow';
});

canvas.addEventListener('pointerdown', (event) => {
  draggingFlag = true;
  previousX = event.clientX;
  previousY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!draggingFlag) return;
  yawValue += (event.clientX - previousX) * 0.008;
  pitchValue = Math.max(-1.0, Math.min(1.0, pitchValue + (event.clientY - previousY) * 0.006));
  previousX = event.clientX;
  previousY = event.clientY;
});
canvas.addEventListener('pointerup', () => { draggingFlag = false; });
canvas.addEventListener('pointercancel', () => { draggingFlag = false; });

const shaderCode = await fetch('./shader.wgsl').then((response) => response.text());

async function main() {
  try {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');

    setStatus('adapter…');
    const gpuAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!gpuAdapter) throw new Error('requestAdapter() returned null');

    setStatus('device…');
    const gpuDevice = await gpuAdapter.requestDevice();
    gpuDevice.lost.then((info) => {
      setStatus('device lost: ' + (info.reason || 'unknown') + ' ' + (info.message || ''), 'error');
    });

    setStatus('shader…');
    const shaderModule = gpuDevice.createShaderModule({ code: shaderCode });
    const compilationInfo = await shaderModule.getCompilationInfo();
    const shaderErrors = compilationInfo.messages.filter((message) => message.type === 'error');
    if (shaderErrors.length) {
      throw new Error(shaderErrors.map((message) => {
        return message.lineNum + ':' + message.linePos + ' ' + message.message;
      }).join('\n'));
    }

    const uniformBuffer = gpuDevice.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    function createPipeline(surfaceFormat) {
      return gpuDevice.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: surfaceFormat }],
        },
        primitive: { topology: 'triangle-list' },
      });
    }

    function createBindGroup(renderPipeline) {
      return gpuDevice.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });
    }

    function writeUniforms(widthValue, heightValue, timeValue) {
      const directionRadians = Number(directionEl.value) * Math.PI / 180;
      const values = new Float32Array([
        widthValue, heightValue, timeValue, modeCode,
        Number(strengthEl.value), Number(scaleEl.value), Number(speedEl.value), Number(iorEl.value),
        yawValue, pitchValue, directionRadians, 0
      ]);
      gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);
    }

    function encodeRender(renderPipeline, bindGroup, textureView) {
      const commandEncoder = gpuDevice.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.015, g: 0.025, b: 0.028, a: 1 },
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

    async function renderChecksum(renderPipeline, bindGroup, timeValue) {
      const textureSize = 64;
      const offscreenTexture = gpuDevice.createTexture({
        size: [textureSize, textureSize, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const readbackBuffer = gpuDevice.createBuffer({
        size: textureSize * 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      writeUniforms(textureSize, textureSize, timeValue);
      const commandEncoder = encodeRender(renderPipeline, bindGroup, offscreenTexture.createView());
      commandEncoder.copyTextureToBuffer(
        { texture: offscreenTexture },
        { buffer: readbackBuffer, bytesPerRow: 256, rowsPerImage: textureSize },
        [textureSize, textureSize, 1]
      );
      gpuDevice.queue.submit([commandEncoder.finish()]);
      await gpuDevice.queue.onSubmittedWorkDone();

      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const mappedBytes = new Uint8Array(readbackBuffer.getMappedRange());
      const copiedBytes = new Uint8Array(mappedBytes.length);
      copiedBytes.set(mappedBytes);
      readbackBuffer.unmap();

      let checksumValue = 0;
      for (let byteIndex = 0; byteIndex < copiedBytes.length; byteIndex += 97) {
        checksumValue = (checksumValue + copiedBytes[byteIndex]) >>> 0;
      }
      return { checksumValue, copiedBytes };
    }

    if (ciMode) {
      setStatus('pipeline…');
      gpuDevice.pushErrorScope('validation');
      const renderPipeline = createPipeline('rgba8unorm');
      const bindGroup = createBindGroup(renderPipeline);

      modeCode = 1;
      strengthEl.value = '0.28';
      scaleEl.value = '5.5';
      speedEl.value = '0.85';
      directionEl.value = '25';
      syncOutputs();

      setStatus('frame A…');
      const firstFrame = await renderChecksum(renderPipeline, bindGroup, 0.20);
      setStatus('frame B…');
      const secondFrame = await renderChecksum(renderPipeline, bindGroup, 1.40);

      const validationError = await gpuDevice.popErrorScope();
      if (validationError) throw new Error('validation: ' + validationError.message);
      if (firstFrame.checksumValue === 0 || secondFrame.checksumValue === 0) {
        throw new Error('render readback checksum was zero');
      }

      let differenceValue = 0;
      for (let byteIndex = 0; byteIndex < firstFrame.copiedBytes.length; byteIndex += 53) {
        differenceValue += Math.abs(firstFrame.copiedBytes[byteIndex] - secondFrame.copiedBytes[byteIndex]);
      }
      if (differenceValue < 80) {
        throw new Error('animated bump produced too little frame difference: ' + differenceValue);
      }

      setStatus(
        'ok · flow diff ' + differenceValue +
        ' · ' + firstFrame.checksumValue + '→' + secondFrame.checksumValue,
        'ok'
      );
      document.body.dataset.ci = 'ok';
      return;
    }

    const gpuContext = canvas.getContext('webgpu');
    if (!gpuContext) throw new Error('webgpu canvas context unavailable');

    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat();
    gpuContext.configure({
      device: gpuDevice,
      format: surfaceFormat,
      alphaMode: 'opaque',
    });

    setStatus('pipeline…');
    gpuDevice.pushErrorScope('validation');
    const renderPipeline = createPipeline(surfaceFormat);
    const bindGroup = createBindGroup(renderPipeline);

    function resizeCanvas() {
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
    const firstEncoder = encodeRender(
      renderPipeline,
      bindGroup,
      gpuContext.getCurrentTexture().createView()
    );
    gpuDevice.queue.submit([firstEncoder.finish()]);
    await gpuDevice.queue.onSubmittedWorkDone();

    const validationError = await gpuDevice.popErrorScope();
    if (validationError) throw new Error('validation: ' + validationError.message);
    setStatus('ok', 'ok');

    const startTime = performance.now();
    function frame(nowValue) {
      resizeCanvas();
      if (!pausedFlag) {
        heldTime = (nowValue - startTime) * 0.001;
      }
      writeUniforms(canvas.width, canvas.height, heldTime);
      const commandEncoder = encodeRender(
        renderPipeline,
        bindGroup,
        gpuContext.getCurrentTexture().createView()
      );
      gpuDevice.queue.submit([commandEncoder.finish()]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (errorValue) {
    console.error(errorValue);
    document.body.dataset.ci = 'error';
    setStatus(String(errorValue && errorValue.message ? errorValue.message : errorValue), 'error');
  }
}

main();
