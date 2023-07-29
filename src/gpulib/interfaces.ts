export interface MyGPU {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  format: GPUTextureFormat;
  context: GPUCanvasContext;
  width: number;
  height: number;
}

export type TYPED_ARRAY = Float32Array | Uint32Array | Int32Array | Uint16Array | Int16Array | Uint8Array | Int8Array;

export interface BufferConfig {
  typedArray?: TYPED_ARRAY;
  byteLength?: number;
  usage?: GPUBufferUsageFlags;
  mappedAtCreation?: boolean;
  debugLabel?: string;
}

export interface VertexBufferConfig extends BufferConfig {
  bindPointIdx: number;
  stride?: number;
  stepMode?: GPUVertexStepMode;
}

export type IndexBufferConfig = BufferConfig;

export interface UniformBufferConfig extends BufferConfig {
  name: string;
  uniforms: Record<string, Uniform>;
}

export interface Uniform {
  type: WGSL_INPUT_TYPE;
  value?: ArrayBuffer | SharedArrayBuffer;
}

export interface AlignedUniform extends Uniform {
  byteOffset: GPUSize64;
  byteSize: GPUSize64;
}

export type WGSL_INPUT_TYPE =
  | "mat4x4<f32>"
  | "mat3x3<f32>"
  | "f32"
  | "vec4<f32>"
  | "vec3<f32>"
  | "vec2<f32>"
  | "i32"
  | "vec4<i32>"
  | "vec3<i32>"
  | "vec2<i32>"
  | "u32"
  | "vec4<u32>"
  | "vec3<u32>"
  | "vec2<u32>"
  | "i16"
  | "u16";

export interface StorageBufferConfig extends BufferConfig {
  stride?: number;
  name: string;
  attributes: Record<string, WGSL_INPUT_TYPE>;
}
