import { UniformBuffer, StorageBuffer } from "../../gpulib/BaseBuffer";
import { Frame2DTexture } from "../../gpulib/Frame2DTexture";
import { InitGPU } from "../../gpulib/gpu";

import computeWGSL from "./compute.wgsl?raw";

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

export const GPUApp = async (canvas: HTMLCanvasElement) => {
  const NUM_PARTICLES = 14;
  const WORKGROUP_SIZE = 8;

  const setupBuffers = () => {
    // Create a uniform buffer for input options.
    const optionsUniformBuffer = new UniformBuffer(gpu, {
      name: "Options",
      uniforms: {
        screen_size: { type: "vec2<f32>", value: new Float32Array([gpu.width, gpu.height]) },
        diffuse_rate: { type: "f32", value: new Float32Array([0.607]) },
        decay_rate: { type: "f32", value: new Float32Array([0.1]) },
      },
    });

    // Create a storage buffer for particles array
    const particlesArray = new Float32Array(NUM_PARTICLES * 4);
    for (let i = 0; i < particlesArray.length; i++) {
      const pos = [rand(0, 128), rand(0, 128)];
      const vel = [rand(-5, 5), rand(-5, 5)];
      particlesArray[i * 4 + 0] = pos[0];
      particlesArray[i * 4 + 1] = pos[1];
      particlesArray[i * 4 + 2] = vel[0];
      particlesArray[i * 4 + 3] = vel[1];
    }
    console.log("Particles Array: ", particlesArray);
    const particlesStorageBuffer = new StorageBuffer(gpu, {
      name: "particlesStorageBuffer",
      typedArray: particlesArray,
      attributes: { pos: "vec2<f32>", vel: "vec2<f32>" },
    });

    return { optionsUniformBuffer, particlesStorageBuffer };
  };

  const gpu = await InitGPU(canvas);
  const { optionsUniformBuffer, particlesStorageBuffer } = setupBuffers();
  console.log(particlesStorageBuffer);
  const frame = new Frame2DTexture(gpu, {
    computeWGSL,
    storageBuffer: particlesStorageBuffer,
    uniformBuffer: optionsUniformBuffer,
    textureDims: [128, 128],
  })
    .addComputePass({ entryPoint: "Simulate", workgroupCount: [1, 1] })
    .addComputePass({ entryPoint: "Diffuse", workgroupCount: [128 / 16, 128 / 16] })
    .addComputePass({ entryPoint: "Paint", workgroupCount: [128 / 16, 128 / 16] });

  let step = 0;

  async function animateFrame() {
    await frame.doComputeAndRenderPass();
    if (step++ < 200) requestAnimationFrame(animateFrame);
  }

  requestAnimationFrame(animateFrame);
};
