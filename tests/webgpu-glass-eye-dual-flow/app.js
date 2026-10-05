const canvas = document.querySelector('#gpu');
const statusEl = document.querySelector('#status');

const outerStrengthEl = document.querySelector('#outerStrength');
const outerScaleEl = document.querySelector('#outerScale');
const outerSpeedEl = document.querySelector('#outerSpeed');
const outerDirectionEl = document.querySelector('#outerDirection');
const irisStrengthEl = document.querySelector('#irisStrength');
const irisScaleEl = document.querySelector('#irisScale');
const irisSpeedEl = document.querySelector('#irisSpeed');
const irisTwistEl = document.querySelector('#irisTwist');
const iorEl = document.querySelector('#ior');

const outerStrengthOut = document.querySelector('#outerStrengthOut');
const outerScaleOut = document.querySelector('#outerScaleOut');
const outerSpeedOut = document.querySelector('#outerSpeedOut');
const outerDirectionOut = document.querySelector('#outerDirectionOut');
const irisStrengthOut = document.querySelector('#irisStrengthOut');
const irisScaleOut = document.querySelector('#irisScaleOut');
const irisSpeedOut = document.querySelector('#irisSpeedOut');
const irisTwistOut = document.querySelector('#irisTwistOut');
const iorOut = document.querySelector('#iorOut');
const descEl = document.querySelector('#desc');

const ciMode = new URLSearchParams(location.search).get('ci') === '1';

const presetDescriptions = {
  cornea: 'Cornea only: 虹彩側の変形を止め、外側ガラス表面の液膜バンプだけを観察します。',
  iris: 'Iris only: 外側ガラスを静止させ、内側の虹彩だけに放射・旋回バンプを流します。',
  dual: 'Dual flow: 外側はゆっくり流れる液膜、内側の虹彩は速い放射・旋回流。二つの法線場を独立して動かします。',
  counter: 'Counterflow: 外側と虹彩を逆方向へ流し、屈折像と虹彩自体の動きが互いにずれる状態を作ります。'
};

const presetValues = {
  cornea: {
    outerStrength: 0.23, outerScale: 5.2, outerSpeed: 0.62, outerDirection: 25,
    irisStrength: 0.00, irisScale: 9.0, irisSpeed: 1.10, irisTwist: 3.2,
  },
  iris: {
    outerStrength: 0.00, outerScale: 4.8, outerSpeed: 0.42, outerDirection: 18,
    irisStrength: 0.42, irisScale: 10.5, irisSpeed: 1.35, irisTwist: 4.4,
  },
  dual: {
    outerStrength: 0.16, outerScale: 4.8, outerSpeed: 0.42, outerDirection: 18,
    irisStrength: 0.30, irisScale: 9.0, irisSpeed: 1.10, irisTwist: 3.2,
  },
  counter: {
    outerStrength: 0.20, outerScale: 5.7, outerSpeed: 0.70, outerDirection: -28,
    irisStrength: 0.34, irisScale: 11.0, irisSpeed: -1.30, irisTwist: -4.8,
  }
};

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
  outerStrengthOut.textContent = Number(outerStrengthEl.value).toFixed(2);
  outerScaleOut.textContent = Number(outerScaleEl.value).toFixed(1);
  outerSpeedOut.textContent = Number(outerSpeedEl.value).toFixed(2);
  outerDirectionOut.textContent = Math.round(Number(outerDirectionEl.value)) + '°';
  irisStrengthOut.textContent = Number(irisStrengthEl.value).toFixed(2);
  irisScaleOut.textContent = Number(irisScaleEl.value).toFixed(1);
  irisSpeedOut.textContent = Number(irisSpeedEl.value).toFixed(2);
  irisTwistOut.textContent = Number(irisTwistEl.value).toFixed(1);
  iorOut.textContent = Number(iorEl.value).toFixed(2);
}

function applyPreset(presetName, buttonEl = null) {
  const presetValue = presetValues[presetName];
  if (!presetValue) return;
  outerStrengthEl.value = presetValue.outerStrength;
  outerScaleEl.value = presetValue.outerScale;
  outerSpeedEl.value = presetValue.outerSpeed;
  outerDirectionEl.value = presetValue.outerDirection;
  irisStrengthEl.value = presetValue.irisStrength;
  irisScaleEl.value = presetValue.irisScale;
  irisSpeedEl.value = presetValue.irisSpeed;
  irisTwistEl.value = presetValue.irisTwist;
  syncOutputs();
  descEl.textContent = presetDescriptions[presetName];

  document.querySelectorAll('button[data-preset]').forEach((node) => {
    node.classList.toggle('active', node === buttonEl || node.dataset.preset === presetName);
  });
  document.body.dataset.preset = presetName;
}

syncOutputs();

document.querySelector('#presets').addEventListener('click', (event) => {
  const buttonEl = event.target.closest('button[data-preset]');
  if (!buttonEl) return;
  applyPreset(buttonEl.dataset.preset, buttonEl);
});

for (const inputEl of [
  outerStrengthEl, outerScaleEl, outerSpeedEl, outerDirectionEl,
  irisStrengthEl, irisScaleEl, irisSpeedEl, irisTwistEl, iorEl
]) {
  inputEl.addEventListener('input', () => {
    syncOutputs();
    document.querySelectorAll('button[data-preset]').forEach((node) => {
      node.classList.remove('active');
    });
    document.body.dataset.preset = 'custom';
  });
}

document.querySelector('#resetView').addEventListener('click', () => {
  yawValue = 0.0;
  pitchValue = 0.05;
});

document.querySelector('#pauseAnim').addEventListener('click', (event) => {
  pausedFlag = !pausedFlag;
  event.currentTarget.textContent = pausedFlag ? 'resume' : 'pause';
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
      setStatus(
        'device lost: ' + (info.reason || 'unknown') + ' ' + (info.message || ''),
        'error'
      );
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
      size: 64,
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
      const outerDirectionRadians = Number(outerDirectionEl.value) * Math.PI / 180;
      const values = new Float32Array([
        widthValue, heightValue, timeValue, 0,
        Number(outerStrengthEl.value), Number(outerScaleEl.value), Number(outerSpeedEl.value), outerDirectionRadians,
        Number(irisStrengthEl.value), Number(irisScaleEl.value), Number(irisSpeedEl.value), Number(irisTwistEl.value),
        yawValue, pitchValue, Number(iorEl.value), 0
      ]);
      gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);
    }

    function encodeRender(renderPipeline, bindGroup, textureView) {
      const commandEncoder = gpuDevice.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.014, g: 0.018, b: 0.022, a: 1 },
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

    async function renderReadback(renderPipeline, bindGroup, timeValue) {
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
      const commandEncoder = encodeRender(
        renderPipeline,
        bindGroup,
        offscreenTexture.createView()
      );
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

      const irisButton = document.querySelector('button[data-preset="iris"]');
      irisButton.click();
      if (
        document.body.dataset.preset !== 'iris' ||
        Number(outerStrengthEl.value) !== 0 ||
        Number(irisStrengthEl.value) <= 0
      ) {
        throw new Error('iris-only preset UI did not update controls');
      }

      setStatus('iris frame A…');
      const firstFrame = await renderReadback(renderPipeline, bindGroup, 0.25);
      setStatus('iris frame B…');
      const secondFrame = await renderReadback(renderPipeline, bindGroup, 1.35);

      const validationError = await gpuDevice.popErrorScope();
      if (validationError) {
        throw new Error('validation: ' + validationError.message);
      }
      if (firstFrame.checksumValue === 0 || secondFrame.checksumValue === 0) {
        throw new Error('render readback checksum was zero');
      }

      let differenceValue = 0;
      for (let byteIndex = 0; byteIndex < firstFrame.copiedBytes.length; byteIndex += 41) {
        differenceValue += Math.abs(
          firstFrame.copiedBytes[byteIndex] -
          secondFrame.copiedBytes[byteIndex]
        );
      }

      if (differenceValue < 80) {
        throw new Error('iris-only animation produced too little frame difference: ' + differenceValue);
      }

      setStatus(
        'ok · iris-only diff ' + differenceValue +
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
    setStatus(
      String(errorValue && errorValue.message ? errorValue.message : errorValue),
      'error'
    );
  }
}

main();
