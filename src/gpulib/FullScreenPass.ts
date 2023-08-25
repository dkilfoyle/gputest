import { UniformBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { MyGPU } from "./interfaces";
import { RenderPipeline } from "./RenderPipeline";

const fullscreenQuadWGSL = `
struct ColorData {
  data : array<u32>,
};

struct Params {
  grid_size: vec2<f32>,
  screen_size: vec2<f32>
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read> finalColorBuffer : ColorData;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
      vec2<f32>( 1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(-1.0,  1.0));

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn frag_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
  // let X = floor(coord.x);
  // let Y = floor(coord.y);
  // let index = u32(X + Y * params.screen_size.x) * 3u;
  // let R = f32(finalColorBuffer.data[index + 0u]) / 255.0;
  // let G = f32(finalColorBuffer.data[index + 1u]) / 255.0;
  // let B = f32(finalColorBuffer.data[index + 2u]) / 255.0;
  // let finalColor = vec4<f32>(R, G, B, 1.0);
  
  let X = floor(coord.x / 512.0 * 32.0);
  let Y = floor(coord.y / 512.0 * 32.0);
  let index = u32(X + (Y*32.0));
  let R = f32(finalColorBuffer.data[index + 0u]);
  let finalColor = vec4<f32>(R, R, R, 1.0);
  return finalColor;
}`;

export class FullscreenPass {
  renderPipeline: RenderPipeline;

  constructor(public gpu: MyGPU, public bindGroups: BindGroup[]) {
    this.renderPipeline = new RenderPipeline(gpu, {
      name: "fullscreenQuadRenderPipeline",
      bindGroupLayout: bindGroups[0].getLayout(),
      vertex: { shaderCode: fullscreenQuadWGSL },
      fragment: { shaderCode: fullscreenQuadWGSL },
    });
  }

  doPass(commandEncoder: GPUCommandEncoder, step: number) {
    // this.paramsUniformBuffer.write(0, new Float32Array([this.gpu.width, this.gpu.height, ...this.bufferDims]));
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.setPipeline(this.renderPipeline.get());
    passEncoder.setBindGroup(0, this.bindGroups[step].get());
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
  }
}
