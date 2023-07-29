import { VertexBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { MyGPU } from "./interfaces";

interface PipelineConfig {
  name: string;
  bindGroupLayout: GPUBindGroupLayout;
}

export interface RenderPipelineConfig extends PipelineConfig {
  vertex: {
    shaderCode: string;
    entryPoint?: string;
    buffer?: VertexBuffer;
  };
  fragment: {
    shaderCode: string;
    entryPoint?: string;
  };
}

export interface ComputePipelineConfig extends PipelineConfig {
  compute: {
    shaderCode: string;
    entryPoint?: string;
  };
}

export class RenderPipeline {
  // fullscreenQuadPipeline = gpu.device.createRenderPipeline({
  //   layout: gpu.device.createPipelineLayout({
  //     bindGroupLayouts: [fullscreenQuadBindGroup.getLayout()],
  //   }),
  //   vertex: {
  //     module: gpu.device.createShaderModule({ code: fullscreenQuadWGSL }),
  //     entryPoint: "vert_main",
  //   },
  //   fragment: {
  //     module: gpu.device.createShaderModule({ code: fullscreenQuadWGSL }),
  //     entryPoint: "frag_main",
  //     targets: [{ format: gpu.format }],
  //   },
  //   primitive: { topology: "triangle-list" },
  // });
  private renderPipeline: GPURenderPipeline;
  public name: string;
  constructor(public gpu: MyGPU, config: RenderPipelineConfig) {
    this.name = config.name;
    this.renderPipeline = gpu.device.createRenderPipeline({
      label: this.name,
      layout: gpu.device.createPipelineLayout({
        bindGroupLayouts: [config.bindGroupLayout],
      }),
      vertex: {
        module: gpu.device.createShaderModule({ code: config.vertex.shaderCode }),
        entryPoint: config.vertex.entryPoint || "vert_main",
        buffers: config.vertex.buffer ? [config.vertex.buffer.getLayout()] : [],
      },
      fragment: {
        module: gpu.device.createShaderModule({ code: config.fragment.shaderCode }),
        entryPoint: config.fragment.entryPoint || "frag_main",
        targets: [{ format: gpu.format }],
      },
      primitive: { topology: "triangle-list" },
    });
  }
  get() {
    return this.renderPipeline;
  }
}

export class ComputePipeline {
  private computePipeline: GPUComputePipeline;
  public name: string;
  constructor(gpu: MyGPU, config: ComputePipelineConfig) {
    this.name = config.name;
    this.computePipeline = gpu.device.createComputePipeline({
      label: this.name,
      layout: gpu.device.createPipelineLayout({
        bindGroupLayouts: [config.bindGroupLayout],
      }),
      compute: {
        module: gpu.device.createShaderModule({ code: config.compute.shaderCode }),
        entryPoint: config.compute.entryPoint || "comp_main",
      },
    });
  }
  get() {
    return this.computePipeline;
  }
}
