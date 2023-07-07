import { useEffect, useState } from "react";
import "./App.css";
import computeWGSL from "./shaders/compute.wgsl?raw";
import vertexWGSL from "./shaders/vertex.wgsl?raw";
import fragmentWGSL from "./shaders/fragment.wgsl?raw";

const rand = (min?: number, max?: number) => {
  if (min === undefined) {
    min = 0;
    max = 1;
  } else if (max == undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max - min);
};

const setup = async () => {
  // Setup
  const gameOptions = {
    width: 128,
    height: 128,
    workgroupSize: 8,
  };

  // Setup adapter and device
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) throw Error("Browser does not support WebGPU");

  // Setup canvas and context
  const canvas = document.querySelector("canvas");
  if (!canvas) throw Error("Unable to find canvas");
  const context = canvas?.getContext("webgpu");
  if (!context) throw Error("Unable to create webGPU context");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context?.configure({
    device,
    format: presentationFormat,
  });

  // Setup compute shader
  const computeShader = device.createShaderModule({ code: computeWGSL, label: "compute shader module" });
  // binding 0: size: vec2<u32>
  // binding 1: pingCells: array<u32>
  // binding 2: pongCells: array<u32>
  const bindGroupLayoutCompute = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
    ],
  });

  // Setup render shaders
  const vertexShader = device.createShaderModule({ code: vertexWGSL, label: "vertex shader module" });
  const fragmentShader = device.createShaderModule({ code: fragmentWGSL, label: "fragment shader module" });
  // binding 0: size: vec2<u32>
  const bindGroupLayoutRender = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
  });

  // Setup static buffers
  const squareVertexArray = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
  const squareVertexBuffer = device.createBuffer({
    size: squareVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Uint32Array(squareVertexBuffer.getMappedRange()).set(squareVertexArray); // copy squareVertices to squareBuffer byte by byte
  squareVertexBuffer.unmap();
  const squareVertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 2 * squareVertexArray.BYTES_PER_ELEMENT,
    stepMode: "vertex",
    attributes: [{ shaderLocation: 1, offset: 0, format: "uint32x2" }],
  };

  const resetGame = () => {
    // init size uniform buffer
    const sizeBuffer = device.createBuffer({
      label: "sizeBuffer: holds grid width and height",
      size: 2 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Uint32Array(sizeBuffer.getMappedRange()).set([gameOptions.width, gameOptions.height]);
    sizeBuffer.unmap();

    // init cell information buffers
    const cellsArray = new Uint32Array(gameOptions.width * gameOptions.height).map((__, i) => (Math.random() < 0.25 ? 1 : 0));
    const pingCellsBuffer = device.createBuffer({
      label: "cells buffer ping state",
      size: cellsArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Uint32Array(pingCellsBuffer.getMappedRange()).set(cellsArray);
    pingCellsBuffer.unmap();
    const pongCellsBuffer = device.createBuffer({
      label: "cells buffer pong state",
      size: cellsArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });
    const cellsBufferLayout: GPUVertexBufferLayout = {
      arrayStride: Uint32Array.BYTES_PER_ELEMENT,
      stepMode: "instance",
      attributes: [{ shaderLocation: 0, offset: 0, format: "uint32" }],
    };

    // set bind groups for the compute shader
    const computeBindGroups = [
      device.createBindGroup({
        label: "pingBindGroup",
        layout: bindGroupLayoutCompute,
        entries: [
          { binding: 0, resource: { buffer: sizeBuffer } },
          { binding: 1, resource: { buffer: pingCellsBuffer } },
          { binding: 2, resource: { buffer: pongCellsBuffer } },
        ],
      }),
      device.createBindGroup({
        label: "pongBindGroup",
        layout: bindGroupLayoutCompute,
        entries: [
          { binding: 0, resource: { buffer: sizeBuffer } },
          { binding: 1, resource: { buffer: pingCellsBuffer } },
          { binding: 2, resource: { buffer: pongCellsBuffer } },
        ],
      }),
    ];

    // set render bind groups
    const renderBindGroup = device.createBindGroup({
      label: "renderBindGroup for size buffer",
      layout: bindGroupLayoutRender,
      entries: [{ binding: 0, resource: { buffer: sizeBuffer, offset: 0, size: 2 * Uint32Array.BYTES_PER_ELEMENT } }],
    });

    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayoutCompute],
      }),
      compute: {
        module: computeShader,
        entryPoint: "main",
        constants: { blockSize: gameOptions.workgroupSize },
      },
    });

    // setup render pipeline
    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayoutRender],
      }),
      primitive: { topology: "triangle-strip" },
      vertex: {
        module: vertexShader,
        entryPoint: "main",
        buffers: [cellsBufferLayout, squareVertexBufferLayout],
      },
      fragment: {
        module: fragmentShader,
        entryPoint: "main",
        targets: [{ format: presentationFormat }],
      },
    });

    let loopTimes = 0;

    const render = () => {
      const commandEncoder = device.createCommandEncoder();

      // Compute Pass
      const computePass = commandEncoder.beginComputePass();
      computePass.setPipeline(computePipeline);
      computePass.setBindGroup(0, loopTimes ? computeBindGroups[0] : computeBindGroups[1]);
      computePass.dispatchWorkgroups(gameOptions.width / gameOptions.workgroupSize, gameOptions.height / gameOptions.workgroupSize);
      computePass.end();

      // Render Pass
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      // renderPass.setPipeline(renderPipeline);
      // renderPass.setVertexBuffer(0, loopTimes ? pongCellsBuffer : pingCellsBuffer);
      // renderPass.setVertexBuffer(1, squareVertexBuffer);
      // renderPass.setBindGroup(0, renderBindGroup);
      // renderPass.draw(4, length);
      renderPass.end();

      device.queue.submit([commandEncoder.finish()]);
    };

    const run = () => {
      render();
      requestAnimationFrame(run);
      loopTimes = 1 - loopTimes;
    };

    loopTimes = 0;
    requestAnimationFrame(run);
  };
  resetGame();
};

function App() {
  useEffect(() => {
    setup();
  }, []);

  return <canvas width="512" height="512"></canvas>;
}

export default App;
