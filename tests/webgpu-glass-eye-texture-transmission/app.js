const canvas = document.querySelector('#gpu');
const statusEl = document.querySelector('#status');
const descEl = document.querySelector('#desc');

const alphaInfluenceEl = document.querySelector('#alphaInfluence');
const minTransmissionEl = document.querySelector('#minTransmission');
const maxTransmissionEl = document.querySelector('#maxTransmission');
const textureScaleEl = document.querySelector('#textureScale');
const scrollSpeedEl = document.querySelector('#scrollSpeed');
const tintStrengthEl = document.querySelector('#tintStrength');
const iorEl = document.querySelector('#ior');
const maskPreviewEl = document.querySelector('#maskPreview');

const alphaInfluenceOut = document.querySelector('#alphaInfluenceOut');
const minTransmissionOut = document.querySelector('#minTransmissionOut');
const maxTransmissionOut = document.querySelector('#maxTransmissionOut');
const textureScaleOut = document.querySelector('#textureScaleOut');
const scrollSpeedOut = document.querySelector('#scrollSpeedOut');
const tintStrengthOut = document.querySelector('#tintStrengthOut');
const iorOut = document.querySelector('#iorOut');

const ciMode = new URLSearchParams(location.search).get('ci') === '1';

const descriptions = {
  clear: 'Clear: Aチャンネルをほぼ1.0にした基準テクスチャ。透明度変化がほとんどない状態です。',
  bands: 'Bands: Aチャンネルに帯状の透明度マスク。透明な帯と濁った帯が球面上を交互に通ります。',
  spots: 'Spots: 半透明の斑点を散らし、ガラス内側の目が場所ごとに見えたり隠れたりします。',
  veins: 'Veins: 細い筋状マスク。透明度と色味を局所変化させ、ガラス内を走る筋のように見せます。',
  cells: 'Cells: セル状パターン。透明度が面単位で切り替わり、ステンドグラス的な局所透過になります。'
};

let currentPattern = 'bands';
let yawValue = 0.0;
let pitchValue = 0.05;
let pausedFlag = false;
let heldTime = 0;
let draggingFlag = false;
let previousX = 0;
let previousY = 0;
let gpuDeviceRef = null;
let surfaceTextureRef = null;

function setStatus(textValue, stateValue = 'boot') {
  statusEl.textContent = textValue;
  statusEl.dataset.state = stateValue;
}

function syncOutputs() {
  alphaInfluenceOut.textContent = Number(alphaInfluenceEl.value).toFixed(2);
  minTransmissionOut.textContent = Number(minTransmissionEl.value).toFixed(2);
  maxTransmissionOut.textContent = Number(maxTransmissionEl.value).toFixed(2);
  textureScaleOut.textContent = Number(textureScaleEl.value).toFixed(1);
  scrollSpeedOut.textContent = Number(scrollSpeedEl.value).toFixed(2);
  tintStrengthOut.textContent = Number(tintStrengthEl.value).toFixed(2);
  iorOut.textContent = Number(iorEl.value).toFixed(2);
}

function fract(value) {
  return value - Math.floor(value);
}

function hash2(xValue, yValue) {
  return fract(Math.sin(xValue * 127.1 + yValue * 311.7) * 43758.5453123);
}

function generateTexture(patternName) {
  const width = 256;
  const height = 128;
  const pixels = new Uint8Array(width * height * 4);

  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    const v = yIndex / height;
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      const u = xIndex / width;
      let alphaMask = 1.0;
      let redValue = 0.45;
      let greenValue = 0.62;
      let blueValue = 0.78;

      if (patternName === 'bands') {
        const bandValue =
          0.5 + 0.5 * Math.sin(
            u * Math.PI * 12 +
            Math.sin(v * Math.PI * 4) * 1.8
          );
        alphaMask = 0.12 + 0.88 * bandValue;
        redValue = 0.28 + 0.35 * bandValue;
        greenValue = 0.48 + 0.30 * bandValue;
        blueValue = 0.72 + 0.18 * bandValue;
      } else if (patternName === 'spots') {
        let nearestValue = 1.0;
        for (let cellY = -1; cellY <= 1; cellY += 1) {
          for (let cellX = -1; cellX <= 1; cellX += 1) {
            const gridX = Math.floor(u * 12) + cellX;
            const gridY = Math.floor(v * 6) + cellY;
            const centerX = (gridX + hash2(gridX, gridY)) / 12;
            const centerY = (gridY + hash2(gridX + 19, gridY + 7)) / 6;
            const dx = u - centerX;
            const dy = v - centerY;
            nearestValue = Math.min(nearestValue, Math.sqrt(dx * dx + dy * dy));
          }
        }
        const spotValue = Math.max(0, Math.min(1, (nearestValue - 0.015) / 0.075));
        alphaMask = 0.10 + 0.90 * spotValue;
        redValue = 0.38 + 0.22 * spotValue;
        greenValue = 0.45 + 0.34 * spotValue;
        blueValue = 0.65 + 0.24 * spotValue;
      } else if (patternName === 'veins') {
        const veinA = Math.abs(Math.sin(u * 41 + Math.sin(v * 17) * 2.8));
        const veinB = Math.abs(Math.sin(v * 33 - Math.sin(u * 13) * 2.1));
        const veinValue = Math.pow(Math.min(veinA, veinB), 8);
        alphaMask = 0.18 + 0.82 * (1.0 - veinValue);
        redValue = 0.62 + 0.30 * veinValue;
        greenValue = 0.38 + 0.26 * (1.0 - veinValue);
        blueValue = 0.42 + 0.36 * (1.0 - veinValue);
      } else if (patternName === 'cells') {
        const gx = Math.floor(u * 14);
        const gy = Math.floor(v * 7);
        const cellValue = hash2(gx, gy);
        alphaMask = 0.10 + 0.90 * cellValue;
        redValue = 0.28 + 0.52 * hash2(gx + 2, gy + 5);
        greenValue = 0.34 + 0.48 * hash2(gx + 7, gy + 1);
        blueValue = 0.46 + 0.42 * hash2(gx + 11, gy + 9);
      }

      const pixelIndex = (yIndex * width + xIndex) * 4;
      pixels[pixelIndex + 0] = Math.round(Math.max(0, Math.min(1, redValue)) * 255);
      pixels[pixelIndex + 1] = Math.round(Math.max(0, Math.min(1, greenValue)) * 255);
      pixels[pixelIndex + 2] = Math.round(Math.max(0, Math.min(1, blueValue)) * 255);
      pixels[pixelIndex + 3] = Math.round(Math.max(0, Math.min(1, alphaMask)) * 255);
    }
  }

  return { width, height, pixels };
}

function uploadPattern(patternName) {
  currentPattern = patternName;
  descEl.textContent = descriptions[patternName];
  document.body.dataset.pattern = patternName;
  document.querySelectorAll('button[data-pattern]').forEach((node) => {
    node.classList.toggle('active', node.dataset.pattern === patternName);
  });

  if (!gpuDeviceRef || !surfaceTextureRef) return;

  const textureData = generateTexture(patternName);
  gpuDeviceRef.queue.writeTexture(
    { texture: surfaceTextureRef },
    textureData.pixels,
    { bytesPerRow: textureData.width * 4, rowsPerImage: textureData.height },
    [textureData.width, textureData.height, 1]
  );
}

syncOutputs();

document.querySelector('#patterns').addEventListener('click', (event) => {
  const buttonEl = event.target.closest('button[data-pattern]');
  if (!buttonEl) return;
  uploadPattern(buttonEl.dataset.pattern);
});

for (const inputEl of [
  alphaInfluenceEl,
  minTransmissionEl,
  maxTransmissionEl,
  textureScaleEl,
  scrollSpeedEl,
  tintStrengthEl,
  iorEl
]) {
  inputEl.addEventListener('input', syncOutputs);
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
  pitchValue = Math.max(
    -1.0,
    Math.min(1.0, pitchValue + (event.clientY - previousY) * 0.006)
  );
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
    gpuDeviceRef = gpuDevice;

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

    const surfaceTexture = gpuDevice.createTexture({
      size: [256, 128, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    surfaceTextureRef = surfaceTexture;

    const surfaceSampler = gpuDevice.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
    });

    uploadPattern(currentPattern);

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
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: surfaceTexture.createView() },
          { binding: 2, resource: surfaceSampler },
        ],
      });
    }

    function writeUniforms(widthValue, heightValue, timeValue) {
      const minTransmission = Number(minTransmissionEl.value);
      const maxTransmission = Math.max(
        minTransmission,
        Number(maxTransmissionEl.value)
      );

      const values = new Float32Array([
        widthValue, heightValue, timeValue, maskPreviewEl.checked ? 1 : 0,
        Number(alphaInfluenceEl.value), minTransmission, maxTransmission, Number(textureScaleEl.value),
        Number(scrollSpeedEl.value), Number(tintStrengthEl.value), Number(iorEl.value), 0,
        yawValue, pitchValue, 0, 0
      ]);
      gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);
    }

    function encodeRender(renderPipeline, bindGroup, textureView) {
      const commandEncoder = gpuDevice.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.012, g: 0.016, b: 0.022, a: 1 },
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

      const bandsButton = document.querySelector('button[data-pattern="bands"]');
      bandsButton.click();
      if (document.body.dataset.pattern !== 'bands') {
        throw new Error('bands texture button did not update state');
      }

      alphaInfluenceEl.value = '0';
      syncOutputs();
      setStatus('alpha off…');
      const alphaOffFrame = await renderReadback(renderPipeline, bindGroup, 0.35);

      alphaInfluenceEl.value = '1';
      syncOutputs();
      setStatus('alpha on…');
      const alphaOnFrame = await renderReadback(renderPipeline, bindGroup, 0.35);

      const validationError = await gpuDevice.popErrorScope();
      if (validationError) {
        throw new Error('validation: ' + validationError.message);
      }
      if (alphaOffFrame.checksumValue === 0 || alphaOnFrame.checksumValue === 0) {
        throw new Error('texture render checksum was zero');
      }

      let differenceValue = 0;
      for (let byteIndex = 0; byteIndex < alphaOffFrame.copiedBytes.length; byteIndex += 41) {
        differenceValue += Math.abs(
          alphaOffFrame.copiedBytes[byteIndex] -
          alphaOnFrame.copiedBytes[byteIndex]
        );
      }
      if (differenceValue < 80) {
        throw new Error(
          'texture alpha produced too little transmission difference: ' +
          differenceValue
        );
      }

      setStatus(
        'ok · texture alpha diff ' + differenceValue +
        ' · ' + alphaOffFrame.checksumValue + '→' + alphaOnFrame.checksumValue,
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
