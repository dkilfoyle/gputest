import { UniformBuffer, StorageBuffer } from "../../gpulib/BaseBuffer";
import { BindGroup } from "../../gpulib/BindGroup";
import { Square } from "../../gpulib/Geometry";
import { ComputePipeline, RenderPipeline } from "../../gpulib/RenderPipeline";
import { InitGPU } from "../../gpulib/gpu";

import computeWGSL from "./compute.wgsl?raw";
import renderWGSL from "./render.wgsl?raw";

export const GameOfLife = async (canvas: HTMLCanvasElement) => {
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
    const cellStateStorageBuffers = [
      new StorageBuffer(gpu, {
        name: "CellIn",
        typedArray: cellStateArray,
        attributes: { state: "u32" },
      }),
      new StorageBuffer(gpu, {
        name: "CellOut",
        byteLength: cellStateArray.byteLength,
        attributes: { state: "u32" },
      }),
    ];

    // create bindgroups for the uniforms and storage buffers
    const bindGroups = [
      new BindGroup(gpu, {
        name: "CellGroupA",
        uniformBuffers: [optionsUniformBuffer],
        storageBuffers: [cellStateStorageBuffers[0], cellStateStorageBuffers[1]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
      new BindGroup(gpu, {
        name: "CellGroupB",
        uniformBuffers: [optionsUniformBuffer],
        storageBuffers: [cellStateStorageBuffers[1], cellStateStorageBuffers[0]],
        storageBufferTypes: ["read-only-storage", "storage"],
      }),
    ];

    console.log(bindGroups[0].getShaderCode());
    return { optionsUniformBuffer, cellStateStorageBuffers, bindGroups };
  };

  const setupPipelines = () => {
    const renderPipeline = new RenderPipeline(gpu, {
      name: "renderPipeline",
      bindGroup: bindGroups[0],
      vertex: { shaderCode: renderWGSL, buffer: square.vertexBuffer },
      fragment: { shaderCode: renderWGSL },
    });

    const computePipeline = new ComputePipeline(gpu, {
      name: "computePipeline",
      bindGroup: bindGroups[0],
      compute: { shaderCode: computeWGSL },
    });

    return { renderPipeline, computePipeline };
  };

  const gpu = await InitGPU(canvas);
  const { square } = setupGeometry();
  const { bindGroups } = setupBuffers();
  const { renderPipeline, computePipeline } = setupPipelines();

  let step = 0;

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined,
        clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  function frame() {
    // prettier-ignore
    renderPassDescriptor.colorAttachments[0].view = gpu.context.getCurrentTexture().createView();

    const encoder = gpu.device.createCommandEncoder();

    // Start a compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline.get());
    bindGroups[step++ % 2].bind(computePass);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    // Start a render pass
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline.get());
    bindGroups[step % 2].bind(renderPass);
    square.draw(renderPass, GRID_SIZE * GRID_SIZE);
    renderPass.end();
    gpu.device.queue.submit([encoder.finish()]);

    if (step < 200) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};
