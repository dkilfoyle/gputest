// Simplified from HWOA-RANG-GPU

import { alignUniformsToStd140Layout } from "./bufferUtils";
import {
  BufferConfig,
  VertexBufferConfig,
  IndexBufferConfig,
  TYPED_ARRAY,
  UniformBufferConfig,
  WGSL_INPUT_TYPE,
  StorageBufferConfig,
  AlignedUniform,
  MyGPU,
} from "./interfaces";

class BaseBuffer {
  protected device: GPUDevice;
  protected buffer: GPUBuffer;
  protected typedArray?: TYPED_ARRAY;

  public byteLength: number;
  public usage: GPUBufferUsageFlags;

  constructor(device: GPUDevice, { typedArray, byteLength, usage, mappedAtCreation = false, debugLabel }: BufferConfig) {
    this.device = device;
    if (!usage) throw Error("BaseBuffer: Usage must be defined");
    this.usage = usage;
    if (typedArray) {
      this.typedArray = typedArray;
      this.byteLength = typedArray.byteLength;
      this.buffer = device.createBuffer({
        size: typedArray.byteLength,
        usage,
        mappedAtCreation: true,
        label: debugLabel,
      });
      switch (true) {
        case typedArray instanceof Float32Array:
          new Float32Array(this.buffer.getMappedRange()).set(typedArray);
          break;
        case typedArray instanceof Int32Array:
          new Int32Array(this.buffer.getMappedRange()).set(typedArray);
          break;
        case typedArray instanceof Uint32Array:
          new Uint32Array(this.buffer.getMappedRange()).set(typedArray);
          break;
        case typedArray instanceof Int16Array:
          new Int16Array(this.buffer.getMappedRange()).set(typedArray);
          break;
        case typedArray instanceof Uint16Array:
          new Uint16Array(this.buffer.getMappedRange()).set(typedArray);
          break;
        default:
          throw Error("Unsupported typedarray type");
      }
      this.buffer.unmap();
    } else {
      if (!byteLength) throw Error("Byte length must be defined if no typedArray input");
      this.byteLength = byteLength;
      this.buffer = device.createBuffer({
        size: byteLength,
        usage,
        mappedAtCreation,
        label: debugLabel,
      });
    }
  }

  get(): GPUBuffer {
    return this.buffer;
  }

  getMappedRange(): ArrayBuffer {
    return this.buffer.getMappedRange();
  }

  unmap(): void {
    this.buffer.unmap();
  }

  write(byteOffset: GPUSize64, data: SharedArrayBuffer | ArrayBuffer): this {
    this.device.queue.writeBuffer(this.buffer, byteOffset, data);
    return this;
  }

  destroy(): void {
    this.buffer.destroy();
  }
}

export class VertexBuffer extends BaseBuffer {
  // const vertexData = new Float32Array([
  //   // position                           // color
  //   -planeWidth / 2, -planeHeight / 2,    1.0, 0.0, 0.0,
  //    planeWidth / 2, -planeHeight / 2,    0.0, 1.0, 0.0,
  //    planeWidth / 2,  planeHeight / 2,    0.0, 0.0, 1.0,
  //   -planeWidth / 2,  planeHeight / 2,    1.0, 1.0, 0.0,
  // ])

  // const vertexBuffer = new VertexBuffer(device, {
  //   bindPointIdx: 0, // position in renderPipeline buffers array { vertex: {buffers: []}}
  //   typedArray: vertexData,
  //   stride: 5 * Float32Array.BYTES_PER_ELEMENT
  // })
  //   .addAttribute('position', {offset: 0, format: "float32x2"}) // @location(0) in vertex shader
  //   .addAttribute('color', {offset: 2 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3"}) // @location(1) in vertex shader

  public bindPointIdx: number; // position in the renderPipeline vertex: {buffers} array
  public stride: GPUSize64;
  public attributes: Map<string, GPUVertexAttribute> = new Map();
  private stepMode: GPUVertexStepMode = "vertex";

  constructor(
    device: GPUDevice,
    {
      usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      stride = 4 * Float32Array.BYTES_PER_ELEMENT, // = xyzw * 4 bytes per 32 bit
      stepMode = "vertex",
      typedArray,
      byteLength,
      bindPointIdx,
      mappedAtCreation,
      debugLabel,
    }: VertexBufferConfig
  ) {
    super(device, { typedArray, byteLength, usage, mappedAtCreation, debugLabel });
    this.bindPointIdx = bindPointIdx;
    this.stride = stride;
    this.stepMode = stepMode;
  }

  get itemsCount(): number {
    return this.byteLength / this.stride;
  }

  getLayout(): GPUVertexBufferLayout {
    // const vertexBufferLayout: GPUVertexBufferLayout = {
    //   arrayStride: 8,
    //   attributes: [
    //     {
    //       format: "float32x2",
    //       offset: 0,
    //       shaderLocation: 0, // Position. Matches @location(0) in the @vertex shader.
    //     },
    //   ],
    // };
    return {
      arrayStride: this.stride,
      stepMode: this.stepMode,
      attributes: this.attributes.values(),
    };
  }

  addAtribute(key: string, { offset = 0, format = "float32x4", shaderLocation }: GPUVertexAttribute) {
    this.attributes.set(key, { offset, format, shaderLocation });
    return this;
  }

  bind(renderPass: GPURenderPassEncoder): this {
    renderPass.setVertexBuffer(this.bindPointIdx, this.buffer);
    return this;
  }
}

export class IndexBuffer extends BaseBuffer {
  get isInt16() {
    return this.typedArray instanceof Uint16Array;
  }

  get itemsCount() {
    if (!this.typedArray) throw Error("IndexBuffer has no typedArray");
    return this.typedArray.length;
  }

  constructor(
    device: GPUDevice,
    { usage = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, typedArray, byteLength, mappedAtCreation, debugLabel }: IndexBufferConfig
  ) {
    super(device, {
      typedArray,
      byteLength,
      usage,
      mappedAtCreation,
      debugLabel,
    });
  }

  bind(renderPass: GPURenderPassEncoder): this {
    renderPass.setIndexBuffer(this.buffer, this.isInt16 ? "uint16" : "uint32");
    return this;
  }
}

export class UniformBuffer extends BaseBuffer {
  public name: string;
  public uniforms: Record<string, AlignedUniform>;
  constructor(gpu: MyGPU, { name, uniforms, usage = GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM, debugLabel }: UniformBufferConfig) {
    const [byteLength, alignedUniforms] = alignUniformsToStd140Layout(uniforms);
    super(gpu.device, {
      byteLength,
      usage,
      debugLabel,
    });
    this.name = name;
    this.uniforms = alignedUniforms;
    for (const uniform of Object.values(alignedUniforms)) {
      if (!uniform.value) {
        continue;
      }
      this.write(uniform.byteOffset, uniform.value);
    }
  }

  updateField(key: string, value: ArrayBuffer | SharedArrayBuffer): this {
    const uniform = this.uniforms[key];
    if (!uniform) {
      console.error(`can't find uniform!`);
      return this;
    }
    uniform.value = value;
    this.device.queue.writeBuffer(this.buffer, uniform.byteOffset, uniform.value);
    return this;
  }

  getBuffer() {
    return this.buffer;
  }
}

export class StorageBuffer extends BaseBuffer {
  public name: string;
  public attributes: Record<string, WGSL_INPUT_TYPE> = {};
  public stride?: number;

  constructor(
    gpu: MyGPU,
    {
      name,
      usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      stride,
      typedArray,
      byteLength,
      mappedAtCreation,
      debugLabel,
      attributes,
    }: StorageBufferConfig
  ) {
    super(gpu.device, {
      typedArray,
      byteLength,
      usage,
      mappedAtCreation,
      debugLabel,
    });
    this.stride = stride;
    this.name = name;
    this.attributes = attributes;
  }

  getBuffer() {
    return this.buffer;
  }

  getCopy(gpu: MyGPU) {
    return new StorageBuffer(gpu, {
      name: this.name + "_out",
      byteLength: this.byteLength,
      attributes: this.attributes,
    });
  }
}
