const canvas = document.querySelector('#gpu');
const statusEl = document.querySelector('#status');
const amountEl = document.querySelector('#amount');
const frequencyEl = document.querySelector('#frequency');
const iorEl = document.querySelector('#ior');
const amountOut = document.querySelector('#amountOut');
const frequencyOut = document.querySelector('#frequencyOut');
const iorOut = document.querySelector('#iorOut');
const descEl = document.querySelector('#desc');
const ciMode = new URLSearchParams(location.search).get('ci') === '1';

const descriptions = [
  'Original: 少し非対称な楕円体ガラス殻と、その内側の虹彩・瞳孔。完全な球ではないので twist の輪郭変化も見えます。',
  'Twist: z に応じて xy を逆回転。ガラス殻・虹彩・瞳孔を同じ座標場でねじります。',
  'Bend: x に応じて xz 平面を回転する近似 inverse bend。輪郭と内部像が一緒に湾曲します。',
  'Taper: z に応じて xy スケールを変化。前後方向に先細り／末広がりになります。',
  'Shear: x ← x − k·z。ガラス全体を平行四辺形的に斜めへずらします。',
  'Stretch/compress: 中央ほど強い Gaussian スケール。局所だけ膨らむ／締まる変形です。',
  'Domain warp: sin 波で座標そのものを3軸方向へ変位。frequency と時間で「柔らかいガラス」のように歪みます。'
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
  frequencyOut.textContent = Number(frequencyEl.value).toFixed(1);
  iorOut.textContent = Number(iorEl.value).toFixed(2);
}
syncOutputs();

document.querySelector('#modes').addEventListener('click', (event) => {
  const buttonEl = event.target.closest('button[data-mode]');
  if (!buttonEl) return;
  modeCode = Number(buttonEl.dataset.mode);
  document.querySelectorAll('button[data-mode]').forEach((node) => node.classList.toggle('active', node === buttonEl));
  descEl.textContent = descriptions[modeCode];
});
for (const inputEl of [amountEl, frequencyEl, iorEl]) inputEl.addEventListener('input', syncOutputs);
document.querySelector('#resetView').addEventListener('click', () => { yawValue = 0; pitchValue = 0.05; });
document.querySelector('#pauseAnim').addEventListener('click', (event) => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'warp resume' : 'warp pause';
});
canvas.addEventListener('pointerdown', (event) => {
  dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yawValue += (event.clientX - lastX) * 0.008;
  pitchValue = Math.max(-1.0, Math.min(1.0, pitchValue + (event.clientY - lastY) * 0.006));
  lastX = event.clientX; lastY = event.clientY;
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

const shaderCode = await fetch('./shader.wgsl').then((r) => r.text());

async function main(){
  try {
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
      size: 48,
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
        modeCode, Number(amountEl.value), Number(frequencyEl.value), Number(iorEl.value),
        yawValue, pitchValue, 0, 0
      ]);
      gpuDevice.queue.writeBuffer(uniformBuffer, 0, values);
    }

    function encodeRender(renderPipeline, bindGroup, textureView){
      const commandEncoder = gpuDevice.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.02, g: 0.02, b: 0.018, a: 1 },
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
      const textureSize = 64;
      const offscreenTexture = gpuDevice.createTexture({
        size: [textureSize, textureSize, 1],
        format: ciFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const readbackBuffer = gpuDevice.createBuffer({
        size: textureSize * 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      writeUniforms(textureSize, textureSize, 0.75);
      const commandEncoder = encodeRender(renderPipeline, bindGroup, offscreenTexture.createView());
      commandEncoder.copyTextureToBuffer(
        { texture: offscreenTexture },
        { buffer: readbackBuffer, bytesPerRow: 256, rowsPerImage: textureSize },
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
      for (let indexValue = 0; indexValue < pixels.length; indexValue += 97) {
        checksumValue = (checksumValue + pixels[indexValue]) >>> 0;
      }
      readbackBuffer.unmap();
      if (checksumValue === 0) throw new Error('render readback checksum was zero');
      setStatus(`ok · checksum ${checksumValue}`, 'ok');
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