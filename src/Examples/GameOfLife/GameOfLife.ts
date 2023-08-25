import { UniformBuffer, StorageBuffer } from "../../gpulib/BaseBuffer";
import { Frame2D, Frame3D } from "../../gpulib/Frame";
import { Square } from "../../gpulib/Geometry";
import { InitGPU } from "../../gpulib/gpu";

import computeWGSL from "./compute.wgsl?raw";
import renderWGSL from "./render.wgsl?raw";

export const GPUApp = async (canvas: HTMLCanvasElement) => {
  const GRID_SIZE = 32;
  const WORKGROUP_SIZE = 8;

  const setupGeometry = () => {
    return { square: new Square(gpu.device, 0.8) };
  };
  const setupBuffers = () => {
    // Create a uniform buffer that describes the grid.
    const optionsUniformBuffer = new UniformBuffer(gpu, {
      name: "Options",
      uniforms: {
        grid_size: {
          type: "vec2<f32>",
          value: new Float32Array([GRID_SIZE, GRID_SIZE]),
        },
      },
    });

    // Create two ping-pong storage arrays representing the state of each cell.
    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    const cellStateStorageBuffer = new StorageBuffer(gpu, {
      name: "CellIn",
      typedArray: cellStateArray,
      attributes: { state: "u32" },
    });

    return { optionsUniformBuffer, cellStateStorageBuffer };
  };

  const gpu = await InitGPU(canvas);
  const { square } = setupGeometry();
  const { optionsUniformBuffer, cellStateStorageBuffer } = setupBuffers();

  const frame = new Frame3D(gpu, {
    computeWGSL,
    renderWGSL,
    geometry: [square],
    storageBuffer: cellStateStorageBuffer,
    uniformBuffer: optionsUniformBuffer,
  });

  let step = 0;

  function animateFrame() {
    frame.doComputeAndRenderPass({ workgroupCount: [4, 4], instances: GRID_SIZE * GRID_SIZE });
    if (step++ < 200) requestAnimationFrame(animateFrame);
  }

  requestAnimationFrame(animateFrame);
};
