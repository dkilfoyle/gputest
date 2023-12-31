import { StorageBuffer, UniformBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { FullscreenPass } from "./FullScreenPass";
import { Geometry } from "./Geometry";
import { ComputePipeline, RenderPipeline } from "./RenderPipeline";
import { Texture } from "./Texture";
import { MyGPU } from "./interfaces";

export interface FrameConfig {
  uniformBuffer: UniformBuffer;
  storageBuffer: StorageBuffer;
}

export interface Frame2DConfig extends FrameConfig {
  computeWGSL: string;
  bufferDims: number[];
}

export interface Frame2DTextureConfig extends FrameConfig {
  computeWGSL: string;
  textureDims: number[];
}

export interface Frame3DConfig extends FrameConfig {
  geometry: Geometry[];
  computeWGSL: string;
  renderWGSL: string;
}

export interface FramePassConfig {
  workgroupCount: number[];
  instances: number;
}

// encapsulate a compute then render pass with ping pong storage buffers
export class PingPongFrame {
  protected gpu: MyGPU;
  protected uniformBuffer: UniformBuffer;
  protected storageBuffers: StorageBuffer[];
  protected bindGroups: BindGroup[];
  protected pingPong = 0;

  constructor(gpu: MyGPU, config: FrameConfig) {
    this.gpu = gpu;
    this.uniformBuffer = config.uniformBuffer;
    config.storageBuffer.name += "_A";
    this.storageBuffers = [config.storageBuffer, config.storageBuffer.getCopy(gpu, "_B")];

    this.bindGroups = this.createBindGroups();
  }

  doComputeAndRenderPass(config: FramePassConfig) {
    return;
  }

  createBindGroups() {
    return [
      new BindGroup(this.gpu, {
        name: "bindGroup0",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[0], this.storageBuffers[1]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
      new BindGroup(this.gpu, {
        name: "bindGroup1",
        uniformBuffers: [this.uniformBuffer],
        storageBuffers: [this.storageBuffers[1], this.storageBuffers[0]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
    ];
  }
}

export class Frame3D extends PingPongFrame {
  private renderPipeline: RenderPipeline;
  private computePipeline: ComputePipeline;
  private geometry: Geometry[];

  constructor(gpu: MyGPU, config: Frame3DConfig) {
    super(gpu, config);
    this.geometry = config.geometry;

    this.renderPipeline = new RenderPipeline(gpu, {
      name: "renderPipeline",
      bindGroupLayout: this.bindGroups[0].getLayout(),
      vertex: { shaderCode: config.renderWGSL, buffer: config.geometry[0].vertexBuffer },
      fragment: { shaderCode: config.renderWGSL },
    });

    this.computePipeline = new ComputePipeline(gpu, {
      name: "computePipeline",
      bindGroupLayout: this.bindGroups[0].getLayout(),
      compute: { shaderCode: config.computeWGSL },
    });
  }

  doComputeAndRenderPass(config: FramePassConfig) {
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
    computePass.dispatchWorkgroups(config.workgroupCount[0], config.workgroupCount[1]);
    computePass.end();

    // Start a render pass
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(this.renderPipeline.get());
    this.bindGroups[this.pingPong % 2].bind(renderPass);
    this.geometry[0].draw(renderPass, config.instances);
    renderPass.end();
    this.gpu.device.queue.submit([encoder.finish()]);
  }
}

export class Frame2D extends PingPongFrame {
  private computePipeline: ComputePipeline;
  private fullScreenPass: FullscreenPass;
  private bufferDims: number[];
  constructor(gpu: MyGPU, config: Frame2DConfig) {
    super(gpu, config);
    this.bufferDims = config.bufferDims;
    this.computePipeline = new ComputePipeline(gpu, {
      name: "computePipeline",
      bindGroupLayout: this.bindGroups[0].getLayout(),
      compute: { shaderCode: config.computeWGSL },
    });
    this.fullScreenPass = new FullscreenPass(gpu, this.bindGroups);
  }

  doComputeAndRenderPass(config: FramePassConfig) {
    const encoder = this.gpu.device.createCommandEncoder();

    // Start a compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline.get());
    this.bindGroups[this.pingPong++ % 2].bind(computePass);
    computePass.dispatchWorkgroups(config.workgroupCount[0], config.workgroupCount[1]);
    computePass.end();

    // do a full screen render pass
    this.fullScreenPass.doPass(encoder, this.pingPong % 2);
    this.gpu.device.queue.submit([encoder.finish()]);
  }
}
