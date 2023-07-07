export const InitGPU = async () => {
  if (!navigator.gpu) throw Error("No GPU");
  const canvas = document.getElementById("canvas-webgpu") as HTMLCanvasElement;
  const adapter = await navigator.gpu?.requestAdapter();
  const device = (await adapter?.requestDevice()) as GPUDevice;
  const context = canvas.getContext("webgpu") as unknown as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });
  return { device, canvas, format, context };
};

export const CreateGPUBuffer = (device: GPUDevice, data: Uint32Array | Float32Array, label = "") => {
  if (data instanceof Uint32Array) {
    const buffer = device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  } else {
    const buffer = device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }
};
