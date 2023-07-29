import { UniformBuffer, StorageBuffer } from "../../gpulib/BaseBuffer";
import { BindGroup } from "../../gpulib/BindGroup";
import { Square } from "../../gpulib/Geometry";
import { InitGPU } from "../../gpulib/gpu";

import computeWGSL from "./compute.wgsl?raw";
import renderWGSL from "./render.wgsl?raw";

export const Rasterizer = async (canvas: HTMLCanvasElement) => {
  const GRID_SIZE = 32;
  const UPDATE_INTERVAL = 250;
  const WORKGROUP_SIZE = 8;

  const setupGeometry = () => {
    return { square: new Square(gpu.device) };
  };
  const setupBuffers = () => {
    // Create a uniform buffer that describes the grid.
    const optionsUniformBuffer = new UniformBuffer(gpu.device, {
      name: "Options",
      uniforms: {
        grid_size: { type: "vec2<f32>", value: new Float32Array([GRID_SIZE, GRID_SIZE]) },
      },
    });

    // Create two ping-pong storage arrays representing the state of each cell.
    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    const cellStateStorageBuffers = [
      new StorageBuffer(gpu.device, {
        debugLabel: "CellA",
        typedArray: cellStateArray,
      }).addAttribute("CellIn", { state: "u32" }),
      new StorageBuffer(gpu.device, {
        debugLabel: "CellB",
        byteLength: cellStateArray.byteLength,
      }).addAttribute("CellOut", { state: "u32" }),
    ];

    // create bindgroups for the uniforms and storage buffers
    const bindGroups = [
      new BindGroup(gpu.device, 0, "CellGroupA") // @group(0)
        .addUniformBuffer(optionsUniformBuffer) // @binding(0)
        .addStorageBuffer(cellStateStorageBuffers[0], true) // @binding(1)
        .addStorageBuffer(cellStateStorageBuffers[1]) // @binding(2)
        .create(),
      new BindGroup(gpu.device, 0, "CellGroupB")
        .addUniformBuffer(optionsUniformBuffer)
        .addStorageBuffer(cellStateStorageBuffers[1], true)
        .addStorageBuffer(cellStateStorageBuffers[0])
        .create(),
    ];

    console.log(bindGroups[0].getShaderCode());
    return { optionsUniformBuffer, cellStateStorageBuffers, bindGroups };
  };
  const setupPipelines = () => {
    // Create the shader that will render the cells.
    const renderShaderModule = gpu.device.createShaderModule({
      label: "RenderShader",
      code: renderWGSL,
    });

    // Create the compute shader that will process the game of life simulation.
    const computeShaderModule = gpu.device.createShaderModule({
      label: "ComputeShaderModule",
      code: computeWGSL,
    });

    // Create a pipeline that renders the cell.
    const renderPipeline = gpu.device.createRenderPipeline({
      label: "renderPipeline",
      layout: bindGroups[0].getPipelineLayout(),
      vertex: {
        module: renderShaderModule,
        entryPoint: "vertexMain",
        buffers: [square.vertexBuffer.getLayout()],
      },
      fragment: {
        module: renderShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: gpu.format }],
      },
      primitive: {
        topology: "triangle-list",
      },
      // multisample: {
      //   count: 4,
      // },
    });

    // Create a compute pipeline that updates the game state.
    const computePipeline = gpu.device.createComputePipeline({
      label: "Simulation pipeline",
      layout: bindGroups[0].getPipelineLayout(),
      compute: {
        module: computeShaderModule,
        entryPoint: "computeMain",
      },
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
    computePass.setPipeline(computePipeline);
    bindGroups[step++ % 2].bind(computePass);
    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    // Start a render pass
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    bindGroups[step % 2].bind(renderPass);
    square.bindBuffers(renderPass);
    square.draw(renderPass, GRID_SIZE * GRID_SIZE);
    renderPass.end();
    gpu.device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};
