import { StorageBuffer, UniformBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { MyGPU } from "./interfaces";
import { RenderPipeline } from "./RenderPipeline";

const fullscreenQuadWGSL = `
struct ColorData {
  data : array<u32>,
};

struct Params {
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
  let X = floor(coord.x);
  let Y = floor(coord.y);
  let index = u32(X + Y * params.screen_size.x) * 3u;

  let R = f32(finalColorBuffer.data[index + 0u]) / 255.0;
  let G = f32(finalColorBuffer.data[index + 1u]) / 255.0;
  let B = f32(finalColorBuffer.data[index + 2u]) / 255.0;

  let finalColor = vec4<f32>(R, G, B, 1.0);
  return finalColor;
}`;

export function createFullscreenPass(gpu: MyGPU, finalColorBuffer: StorageBuffer) {
  const paramsUniformBuffer = new UniformBuffer(gpu, {
    name: "fullscreenQuadParamsUniformBuffer",
    uniforms: [{ name: "screen_size", type: "vec2<f32>", value: new Float32Array([gpu.width, gpu.height]) }],
  });

  const fullscreenQuadBindGroup = new BindGroup(gpu, {
    name: "fullscreenQuadBindGroup",
    uniformBuffers: [paramsUniformBuffer],
    storageBuffers: [finalColorBuffer],
    storageBufferTypes: ["read-only-storage"],
  });

  const fullscreenQuadPipeline = new RenderPipeline(gpu, {
    name: "fullscreenQuadRenderPipeline",
    bindGroup: fullscreenQuadBindGroup,
    vertex: { shaderCode: fullscreenQuadWGSL },
    fragment: { shaderCode: fullscreenQuadWGSL },
  });

  const addFullscreenPass = (commandEncoder: GPUCommandEncoder) => {
    paramsUniformBuffer.write(0, new Float32Array([gpu.width, gpu.height]));
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.setPipeline(fullscreenQuadPipeline.get());
    passEncoder.setBindGroup(0, fullscreenQuadBindGroup.get());
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
  };

  return { addFullscreenPass };
}
