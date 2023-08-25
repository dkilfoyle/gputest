import { StorageBuffer } from "./BaseBuffer";
import { PingPongFrame, Frame2DTextureConfig, FramePassConfig } from "./Frame";
import { ComputePipeline, RenderPipeline } from "./RenderPipeline";
import { Texture } from "./Texture";
import { MyGPU } from "./interfaces";

const fullscreenTextureQuadWGSL = `
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) coord: vec2<f32>,
};

@group(0) @binding(0) var computeTexture : texture_2d<f32>;
@group(0) @binding(1) var dstSampler : sampler;

@vertex
fn vert_main(@builtin(vertex_index) idx : u32) -> VSOut {
  var data = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(1.0, -1.0),
      vec2<f32>(1.0, 1.0),

      vec2<f32>(-1.0, -1.0),
      vec2<f32>(-1.0, 1.0),
      vec2<f32>(1.0, 1.0),
  );

  let pos = data[idx];

  var out : VSOut;
  out.pos = vec4<f32>(pos, 0.0, 1.0);
  out.coord.x = (pos.x + 1.0) / 2.0;
  out.coord.y = (1.0 - pos.y) / 2.0;

  return out;
}

@fragment
fn frag_main(inp: VSOut) -> @location(0) vec4<f32> {
    let v = textureSample(computeTexture, dstSampler, inp.coord);
    return v;
}
`;

interface ComputePassConfig {
  workgroupCount: number[];
  entryPoint: string;
}

interface ComputePass {
  pipeline: ComputePipeline;
  workgroupCount: number[];
}

export class Frame2DTexture extends PingPongFrame {
  private computePasses: ComputePass[] = [];
  private renderPipeline: RenderPipeline;
  private computeBindGroupLayout: GPUBindGroupLayout;
  private computeBindGroups: GPUBindGroup[];
  private renderBindGroups: GPUBindGroup[];
  private textureDims: number[];
  private textures: Texture[];
  private sampler: GPUSampler;
  private computeWGSL: string;

  constructor(gpu: MyGPU, config: Frame2DTextureConfig) {
    super(gpu, config);
    this.textureDims = config.textureDims;
    this.computeWGSL = config.computeWGSL;
    this.storageBuffers.push(
      new StorageBuffer(gpu, {
        name: "screenArray",
        typedArray: new Float32Array(128 * 128 * 4),
        attributes: { pixels: "vec4<f32>" },
      })
    );

    this.textures = [new Texture(gpu, this.textureDims[0], this.textureDims[1]), new Texture(gpu, this.textureDims[0], this.textureDims[1])];
    this.sampler = gpu.device.createSampler({
      label: "texture sampler",
      magFilter: "linear",
    });

    // TODO: use class BindGroup
    this.computeBindGroupLayout = gpu.device.createBindGroupLayout({
      label: "ComputeBindGroupLayout",
      entries: [
        {
          binding: 0, // setup options
          visibility: GPUShaderStage.COMPUTE,
          buffer: {},
        },
        {
          binding: 1, // input data for compute shader
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2, // output data from compute shader - will be input for next frame
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" }, // Cell state output buffer
        },
        {
          binding: 3, // screen output data from compute shader
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" }, // Cell state output buffer
        },
        {
          binding: 4, // input texture for compute shader
          visibility: GPUShaderStage.COMPUTE,
          texture: { multisampled: false },
        },
        {
          binding: 5, // output texture for compute shader
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba8unorm",
          },
        },
      ],
    });

    this.computeBindGroups = [0, 1].map((i) =>
      gpu.device.createBindGroup({
        label: "computeBindGroup" + i,
        layout: this.computeBindGroupLayout, //this.computePipelines[0].get().getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: this.uniformBuffer.get() },
          },
          {
            binding: 1,
            resource: { buffer: this.storageBuffers[i].get() },
          },
          {
            binding: 2,
            resource: { buffer: this.storageBuffers[(i + 1) % 2].get() },
          },
          {
            binding: 3,
            resource: { buffer: this.storageBuffers[2].get() },
          },
          {
            binding: 4,
            resource: this.textures[i].view,
          },
          {
            binding: 5,
            resource: this.textures[(i + 1) % 2].view,
          },
        ],
      })
    );

    this.renderPipeline = new RenderPipeline(gpu, {
      name: "fullScreen2DTextureRenderPipeline",
      bindGroupLayout: gpu.device.createBindGroupLayout({
        label: "fullScreen2DTextureBindGroupLayout",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { multisampled: false },
          },
          // Sampler for  the texture.
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" },
          },
        ],
      }),
      vertex: { shaderCode: fullscreenTextureQuadWGSL },
      fragment: { shaderCode: fullscreenTextureQuadWGSL },
    });

    this.renderBindGroups = [1, 0].map((i) =>
      gpu.device.createBindGroup({
        label: "renderBindGroup0",
        layout: this.renderPipeline.get().getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: this.textures[i].view, // output from compute0
          },
          {
            binding: 1,
            resource: this.sampler,
          },
        ],
      })
    );
  }

  addComputePass(config: ComputePassConfig) {
    this.computePasses.push({
      pipeline: new ComputePipeline(this.gpu, {
        name: config.entryPoint,
        bindGroupLayout: this.computeBindGroupLayout,
        compute: { shaderCode: this.computeWGSL, entryPoint: config.entryPoint },
      }),
      workgroupCount: config.workgroupCount,
    });
    return this;
  }

  doComputeAndRenderPass() {
    const encoder = this.gpu.device.createCommandEncoder();

    // Do each compute pass
    this.computePasses.forEach((pass) => {
      const computePass = encoder.beginComputePass();
      computePass.setPipeline(pass.pipeline.get());
      computePass.setBindGroup(0, this.computeBindGroups[this.pingPong % 2]);
      computePass.dispatchWorkgroups(pass.workgroupCount[0], pass.workgroupCount[1]);
      computePass.end();
    });

    // do a full screen render pass
    const renderEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderEncoder.setPipeline(this.renderPipeline.get());
    renderEncoder.setBindGroup(0, this.renderBindGroups[this.pingPong++ % 2]);
    renderEncoder.draw(6, 1, 0, 0);
    renderEncoder.end();

    this.gpu.device.queue.submit([encoder.finish()]);
  }
}
