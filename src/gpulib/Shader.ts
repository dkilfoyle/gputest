const VERTEX_WGLSL_TYPES = new Map([
  ["float32", "f32"],
  ["float32x2", "vec2<f32>"],
  ["float32x3", "vec3<f32>"],
  ["float32x4", "vec4<f32>"],
  ["sint32", "i32"],
  ["sint32x2", "vec2<i32>"],
  ["sint32x3", "vec3<i32>"],
  ["sint32x4", "vec4<f32>"],
  ["uint32", "u32"],
  ["uint32x2", "vec2<u32>"],
  ["uint32x3", "vec3<u32>"],
  ["uint32x4", "vec4<u32>"],
]);

export class Shader {
  protected device: GPUDevice;
  public module!: GPUShaderModule;
  public source = "";

  get shaderModule(): GPUShaderModule {
    if (!this.module) {
      this.module = this.device.createShaderModule({
        code: this.source,
      });
    }
    return this.module;
  }

  constructor(device: GPUDevice) {
    this.device = device;
  }

  addUniformInputs(uniformBuffers: UniformBuffer[]): this {
    for (const [i, ub] of uniformBuffers.entries()) {
    }
  }
}
