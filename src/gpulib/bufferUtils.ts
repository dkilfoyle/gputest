import { Uniform, AlignedUniform } from "./interfaces";

const UNIFORM_ALIGNMENT_SIZE_MAP: Map<string, [number, number]> = new Map([
  ["mat4x4<f32>", [64, 64]], // 16 * 4
  ["mat3x3<f32>", [48, 48]], // 16 * 3
  ["vec4<f32>", [16, 16]],
  ["vec3<f32>", [16, 12]], // special case
  ["vec2<f32>", [8, 8]],
  ["f32", [4, 4]],
  ["i32", [4, 4]],
  ["u32", [4, 4]],
  ["i16", [2, 2]],
  ["u16", [2, 2]],
]);

// Uniform structs using std140 layout, so each block needs to be 16 bytes aligned
// Taken from FUNGI by @sketchpunk
// https://github.com/sketchpunk/Fungi/blob/f73e8affa68219dce6d1934f6512fa6144ba5815/fungi/core/Ubo.js#L119
let _uniformBlockSpace = 16;
let _prevUniform: AlignedUniform | null;
let _uniformByteLength = 0;
export const alignUniformsToStd140Layout = (uniforms: Record<string, Uniform>): [number, Record<string, AlignedUniform>] => {
  const outUniforms: Record<string, AlignedUniform> = {};

  for (const [key, uniform] of Object.entries(uniforms)) {
    const uniformSize = UNIFORM_ALIGNMENT_SIZE_MAP.get(uniform.type);
    if (!uniformSize) {
      throw new Error("cant find uniform mapping");
    }

    const [alignment, size] = uniformSize;

    if (_uniformBlockSpace >= alignment) {
      _uniformBlockSpace -= size;
    } else if (_uniformBlockSpace > 0 && _prevUniform && !(_uniformBlockSpace === 16 && size === 16)) {
      _prevUniform.byteSize += _uniformBlockSpace;
      _uniformByteLength += _uniformBlockSpace;
      _uniformBlockSpace = 16 - size;
    }

    const augmentedUniform = {
      byteOffset: _uniformByteLength,
      byteSize: size,
      ...uniform,
    };
    outUniforms[key] = augmentedUniform;

    _uniformByteLength += size;
    _prevUniform = augmentedUniform;
    if (_uniformByteLength <= 0) {
      _uniformBlockSpace = 16;
    }
  }
  const byteLength = _uniformByteLength;
  _uniformBlockSpace = 16;
  _prevUniform = null;
  _uniformByteLength = 0;

  return [byteLength, outUniforms];
};
