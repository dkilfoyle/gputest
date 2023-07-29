import { StorageBuffer, UniformBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { Geometry } from "./Geometry";
import { ComputePipeline, RenderPipeline } from "./RenderPipeline";
import { MyGPU } from "./interfaces";

export interface FrameConfig {
  uniformBuffer: UniformBuffer;
  storageBuffers: StorageBuffer[];
}

export interface Frame2DConfig {
  computeWGSL: string;
}

export interface Frame3DConfig {
  geometry: Geometry[];
  computeWGSL: string;
  renderWGSL: string;
}

// encapsulate a compute then render pass with ping pong buffers
export class Frame {
  private gpu: MyGPU;

  private uniformBuffer: UniformBuffer;
  private storageBuffers: StorageBuffer[];
  private geometry: Geometry[];
  private renderWGSL: string;
  private computeWGSL: string;

  private bindGroups: BindGroup[];
  private renderPipeline: RenderPipeline;
  private computePipeline: ComputePipeline;

  private pingPong = 0;

  constructor(gpu: MyGPU, config: FrameConfig) {
    this.gpu = gpu;
    this.uniformBuffer = config.uniformBuffer;
    this.storageBuffers = config.storageBuffers;
    this.geometry = config.geometry;
    this.renderWGSL = config.renderWGSL;
    this.computeWGSL = config.computeWGSL;

    this.bindGroups = [
      new BindGroup(gpu, {
        name: "bindGroup0",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[0], this.storageBuffers[1]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
      new BindGroup(gpu, {
        name: "bindGroup1",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[1], this.storageBuffers[0]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
    ];

    this.renderPipeline = new RenderPipeline(gpu, {
      name: "renderPipeline",
      bindGroup: this.bindGroups[0],
      vertex: { shaderCode: this.renderWGSL, buffer: this.geometry[0].vertexBuffer },
      fragment: { shaderCode: this.renderWGSL },
    });

    this.computePipeline = new ComputePipeline(gpu, {
      name: "computePipeline",
      bindGroup: this.bindGroups[0],
      compute: { shaderCode: this.computeWGSL },
    });
  }

  doComputeAndRenderPass(config: { workgroup_count?: number[]; instances: number[] }) {
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    } as GPURenderPassDescriptor;
    const encoder = this.gpu.device.createCommandEncoder();

    // Start a compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline.get());
    this.bindGroups[this.pingPong++ % 2].bind(computePass);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    // Start a render pass
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(this.renderPipeline.get());
    this.bindGroups[this.pingPong % 2].bind(renderPass);
    this.geometry[0].draw(renderPass, GRID_SIZE * GRID_SIZE);
    renderPass.end();
    this.gpu.device.queue.submit([encoder.finish()]);
  }
}

export class Frame2D extends Frame {
  constructor({computeWGSL, })
    this.renderWGSL = config.renderWGSL;
    this.computeWGSL = config.computeWGSL;

    this.bindGroups = [
      new BindGroup(gpu, {
        name: "bindGroup0",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[0], this.storageBuffers[1]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
      new BindGroup(gpu, {
        name: "bindGroup1",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[1], this.storageBuffers[0]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
    ];

    this.renderPipeline = new RenderPipeline(gpu, {
      name: "renderPipeline",
      bindGroup: this.bindGroups[0],
      vertex: { shaderCode: this.renderWGSL, buffer: this.geometry[0].vertexBuffer },
      fragment: { shaderCode: this.renderWGSL },
    });

    this.computePipeline = new ComputePipeline(gpu, {
      name: "computePipeline",
      bindGroup: this.bindGroups[0],
      compute: { shaderCode: this.computeWGSL },
    });
  }

  doComputeAndRenderPass(config: { workgroup_count?: number[]; instances: number[] }) {
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    } as GPURenderPassDescriptor;
    const encoder = this.gpu.device.createCommandEncoder();

    // Start a compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline.get());
    this.bindGroups[this.pingPong++ % 2].bind(computePass);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    // Start a render pass
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(this.renderPipeline.get());
    this.bindGroups[this.pingPong % 2].bind(renderPass);
    this.geometry[0].draw(renderPass, GRID_SIZE * GRID_SIZE);
    renderPass.end();
    this.gpu.device.queue.submit([encoder.finish()]);
  }
}
