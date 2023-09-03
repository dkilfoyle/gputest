import { StorageBuffer } from "./BaseBuffer";
import { BindGroup } from "./BindGroup";
import { PingPongFrame, Frame2DTextureConfig, FramePassConfig } from "./Frame";
import { ComputePipeline, RenderPipeline } from "./RenderPipeline";
import { Texture } from "./Texture";
import { MyGPU } from "./interfaces";

const dbg_wgsl = `
@group(1) @binding(0) var<storage, read_write> _dbg: array<u32>;
var<private> _dbg_unit: u32;

fn dbg_init(uid: u32) {
  // 16 = unit header size in u32s
  // uid = global invocation
  // 1 = entries count u32
  // 20 * 3 = 20 entries per invocation and 3 u32 per entry
  // entry = [type_u32, value_u32, mark_u32]
  _dbg_unit = 16u + uid * (1 + 20 * 3);
  _dbg[_dbg_unit] = 0u; // 0 entries
}

fn dbg_32m(mark: i32, val: u32, vtype: i32) {
  /* limit entries count, but still store the total number of calls */
	var entry_count = _dbg[_dbg_unit];
	_dbg[_dbg_unit] = entry_count + 1u;
	if (entry_count >= 20u) {
		return;
	}

	/* store data in a new debug unit entry */
	var entry_off = _dbg_unit + 1u + entry_count * 3u;
	_dbg[entry_off] = u32(vtype);
	_dbg[entry_off + 1u] = val;
	_dbg[entry_off + 2u] = u32(mark);
}

fn dbg_u32m(mark: i32, val: u32) { dbg_32m(mark, val,1); }
fn dbg_i32m(mark: i32, val: i32) { dbg_32m(mark, bitcast<u32>(val), 2); }
fn dbg_f32m(mark: i32, val: f32) { dbg_32m(mark, bitcast<u32>(val), 3); }

fn dbg_32(val: u32, vtype: i32) { dbg_32m(999999, val, vtype); }
fn dbg_u32(val: u32) { dbg_u32m(999999, val); }
fn dbg_i32(val: i32) { dbg_i32m(999999, val); }
fn dbg_f32(val: f32) { dbg_f32m(999999, val); }
`;

export type WGSL_debug_entry = {
  value: number;
  type: number;
  mark: number;
  processed: boolean; // for output optimisations
};

class Debug {
  // adapted from https://github.com/looran/wgsl-debug/
  public bindGroup: GPUBindGroup;
  public bindGroupLayout: GPUBindGroupLayout;
  public storageBuffers: StorageBuffer[];
  public bufByteLength: number;
  public unitSize: number;

  constructor(public gpu: MyGPU, public unitCount = 20) {
    this.unitSize = unitCount * 3 + 1;
    this.bufByteLength = (16 + this.unitSize) * Uint32Array.BYTES_PER_ELEMENT;
    this.storageBuffers = [
      new StorageBuffer(gpu, {
        name: "debug storage source buffer",
        byteLength: this.bufByteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        attributes: { bytes: "u32" },
      }),
      new StorageBuffer(gpu, {
        name: "debug storage dst buffer",
        byteLength: this.bufByteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        attributes: { bytes: "u32" },
      }),
    ];
    this.bindGroupLayout = gpu.device.createBindGroupLayout({
      label: "debug bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });
    this.bindGroup = gpu.device.createBindGroup({
      label: "debug bind group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.storageBuffers[0].get() },
        },
      ],
    });
  }
  fetch(cmd: GPUCommandEncoder) {
    cmd.copyBufferToBuffer(this.storageBuffers[0].get(), 0, this.storageBuffers[1].get(), 0, this.bufByteLength);
  }
  async process() {
    await this.storageBuffers[1].get().mapAsync(GPUMapMode.READ);
    const buf = this.storageBuffers[1].get().getMappedRange();
    const buf_u32 = new Uint32Array(buf);
    const buf_i32 = new Int32Array(buf);
    const buf_f32 = new Float32Array(buf);
    const pass_data: Array<Array<WGSL_debug_entry>> = Array.from(Array(this.unitCount), () => []); // [uid: [entry,...] ]

    /* read retrieved data to pass_data */
    const warnings = []; // [ [ uid, entry_count ], ... ]
    for (let uid = 0; uid < this.unitCount; uid += 1) {
      const unit_off = 16 + uid * this.unitSize;
      const entry_count = buf_u32[unit_off];
      if (entry_count > 0) {
        if (entry_count > this.unitCount) {
          warnings.push([uid, entry_count]);
        }
        for (let entry = 0; entry < Math.min(entry_count, this.unitCount); entry++) {
          /* for each debug entry of this unit */
          /* read value with appropriate type, and mark */
          const entry_off = unit_off + 1 + entry * 3;
          const type = buf_u32[entry_off];
          let value = -1;
          if (type == 1) {
            value = buf_u32[entry_off + 1];
          } else if (type == 2) {
            value = buf_i32[entry_off + 1];
          } else if (type == 3) {
            value = buf_f32[entry_off + 1];
          }
          const mark = buf_u32[entry_off + 2];
          /* append value to pass_data */
          pass_data[uid].push(<WGSL_debug_entry>{
            value: value,
            type: type,
            mark: mark,
          });
        }
      }
    }
    this.storageBuffers[1].get().unmap();
    // eslint-disable-next-line no-debugger
    debugger;
    pass_data.forEach((entries, uid) => {
      console.log(`${uid} [${entries.length}] ${entries}`);
    });
  }
}

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
  private debug: Debug;

  constructor(gpu: MyGPU, config: Frame2DTextureConfig) {
    super(gpu, config);
    this.debug = new Debug(gpu, 20);
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
      bindGroupLayouts: [
        gpu.device.createBindGroupLayout({
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
      ],
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
        bindGroupLayouts: [this.computeBindGroupLayout, this.debug.bindGroupLayout],
        compute: { shaderCode: dbg_wgsl + this.computeWGSL, entryPoint: config.entryPoint },
      }),
      workgroupCount: config.workgroupCount,
    });
    return this;
  }

  async doComputeAndRenderPass() {
    const encoder = this.gpu.device.createCommandEncoder();

    // Do each compute pass
    this.computePasses.forEach((pass) => {
      const computePass = encoder.beginComputePass();
      computePass.setPipeline(pass.pipeline.get());
      computePass.setBindGroup(0, this.computeBindGroups[this.pingPong % 2]);
      computePass.setBindGroup(1, this.debug.bindGroup);
      computePass.dispatchWorkgroups(pass.workgroupCount[0], pass.workgroupCount[1]);
      computePass.end();
    });

    this.debug.fetch(encoder);
    if (this.pingPong == 1) await this.debug.process();

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
