import { StorageBuffer, UniformBuffer } from "./BaseBuffer";
import { Texture } from "./Texture";
import { MyGPU } from "./interfaces";

const toFirstLetterLowerCase = (x: string) => {
  return x[0].toLowerCase() + x.substring(1);
};

export interface BindGroupConfig {
  name: string;
  groupIndex?: number;
  uniformBuffers?: UniformBuffer[];
  storageBuffers?: StorageBuffer[];
  storageBufferTypes?: GPUBufferBindingType[];
  // textures?: Texture[];
}

export class BindGroup {
  private device: GPUDevice;
  private bindGroup!: GPUBindGroup;
  private name: string;

  public groupIndex: number; // @group(__)
  // public textures: Texture[] = [];
  public uniformBuffers: UniformBuffer[] = [];
  public storageBuffers: StorageBuffer[] = [];
  public storageBufferTypes: GPUBufferBindingType[] = [];

  constructor(gpu: MyGPU, config: BindGroupConfig) {
    this.device = gpu.device;
    this.name = config.name;
    this.groupIndex = config.groupIndex || 0;
    this.uniformBuffers = config.uniformBuffers || [];
    this.storageBuffers = config.storageBuffers || [];
    this.storageBufferTypes = config.storageBufferTypes || [];
    // this.textures = config.textures || [];
    return this.create();
  }

  get() {
    return this.bindGroup;
  }

  bind(renderPass: GPURenderPassEncoder | GPUComputePassEncoder): this {
    renderPass.setBindGroup(this.groupIndex, this.bindGroup);
    return this;
  }

  addStorageBuffer(storageBuffer: StorageBuffer, readOnly = false): this {
    this.storageBuffers.push(storageBuffer);
    this.storageBufferTypes.push(readOnly ? "read-only-storage" : "storage");
    return this;
  }

  addUniformBuffer(uniformBuffer: UniformBuffer): this {
    this.uniformBuffers.push(uniformBuffer);
    return this;
  }

  getLayout() {
    // const bindGroupLayout = gpu.device.createBindGroupLayout({
    //   label: "My Bind Group Layout",
    //   entries: [
    //     {
    //       binding: 0, // setup options
    //       visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    //       buffer: {},
    //     },
    //     {
    //       binding: 1, // input data for compute shader
    //       visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    //       buffer: { type: "read-only-storage" },
    //     },
    //     {
    //       binding: 2, // output data from compute shader - will be input for next frame
    //       visibility: GPUShaderStage.COMPUTE,
    //       buffer: { type: "storage" }, // Cell state output buffer
    //     },
    //     {
    //       binding: 3, // input texture for compute shader
    //       visibility: GPUShaderStage.COMPUTE,
    //       texture: { multisampled: false }
    //     },
    //     {
    //       binding: 4, // output texture for compute shader
    //       visibility: GPUShaderStage.COMPUTE,
    //       storageTexture: {
    //         access: 'write-only',
    //         format: computeTexFormat,
    //       }
    //     },
    //   ],
    // });
    const entries: GPUBindGroupLayoutEntry[] = [];
    let accBindingIndex = 0;
    this.uniformBuffers.forEach(() => {
      entries.push({
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        binding: accBindingIndex++,
        buffer: {
          type: "uniform",
        },
      });
    });
    this.storageBuffers.forEach((_, i) => {
      entries.push({
        visibility:
          this.storageBufferTypes[i] == "read-only-storage"
            ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE
            : GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        binding: accBindingIndex++,
        buffer: {
          type: this.storageBufferTypes[i],
        },
      });
    });
    return this.device.createBindGroupLayout({
      entries,
      label: this.name,
    });
  }

  getShaderCode(): string {
    let source = "";

    for (const [i, ub] of this.uniformBuffers.entries()) {
      source += `
struct ${ub.name} {
  ${Object.entries(ub.uniforms)
    .map(([key, ud]) => `${key}: ${ud.type}`)
    .join(";\n")}
}
@group(0) @binding(${i}) var<uniform> ${ub.name.toLowerCase()}:${ub.name};
`;
    }

    this.storageBuffers.forEach((sb, i) => {
      source += `
struct ${sb.name} {
  ${Object.entries(sb.attributes)
    .map(([key, format]) => `${key}: ${format};`)
    .join("\n")}
};

@group(0) @binding(${this.uniformBuffers.length + i}) var<storage, ${
        this.storageBufferTypes[i] == "read-only-storage" ? "read" : "read_write"
      }> ${toFirstLetterLowerCase(sb.name)}s: array<${sb.name}>;
`;
    });

    return source;
  }

  create(): this {
    const entries: GPUBindGroupEntry[] = [];
    let accBindingIndex = 0;
    this.uniformBuffers.forEach((buffer) => {
      console.log("buffer", buffer);
      entries.push({
        binding: accBindingIndex++,
        resource: {
          buffer: buffer.get(),
          offset: 0,
          size: buffer.byteLength,
        },
      });
    });
    this.storageBuffers.forEach((buffer) => {
      entries.push({
        binding: accBindingIndex++,
        resource: {
          buffer: buffer.get(),
          offset: 0,
          size: buffer.byteLength,
        },
      });
    });
    this.bindGroup = this.device.createBindGroup({
      layout: this.getLayout(),
      entries,
      label: this.name,
    });
    return this;
  }
  destroy() {
    this.uniformBuffers.forEach((b) => b.destroy());
    this.storageBuffers.forEach((b) => b.destroy());
  }
}
