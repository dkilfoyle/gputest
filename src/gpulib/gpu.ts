import { MyGPU } from "./interfaces";

export const InitGPU = async (canvas: HTMLCanvasElement): Promise<MyGPU> => {
  if (!navigator.gpu) throw Error("No GPU");
  const adapter = await navigator.gpu?.requestAdapter();
  const device = (await adapter?.requestDevice()) as GPUDevice;
  const context = canvas.getContext("webgpu") as unknown as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  // const devicePixelRatio = window.devicePixelRatio || 1;
  const devicePixelRatio = 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });
  return { device, canvas, format, context, width: canvas.width, height: canvas.height };
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
