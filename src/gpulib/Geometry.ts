import { VertexBuffer, IndexBuffer } from "./BaseBuffer";

export class Geometry {
  public vertexBuffer!: VertexBuffer;
  public indexBuffer!: IndexBuffer;
  constructor(public name: string) {
    this.name = name;
  }
  draw(renderPass: GPURenderPassEncoder, instanceCount = 1) {
    this.vertexBuffer.bind(renderPass);
    this.indexBuffer.bind(renderPass);
    renderPass.drawIndexed(this.indexBuffer.itemsCount, instanceCount);
  }
}

export class Square extends Geometry {
  constructor(device: GPUDevice, scale = 1) {
    //  Create a buffer with the vertices for a single cell.
    super("Square");
    const vertices = new Float32Array([-scale, -scale, scale, -scale, scale, scale, -scale, scale]);
    this.vertexBuffer = new VertexBuffer(device, {
      bindPointIdx: 0,
      typedArray: vertices,
      stride: 2 * vertices.BYTES_PER_ELEMENT,
    }).addAtribute("position", { offset: 0, format: "float32x2", shaderLocation: 0 }); // @location(0)

    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    this.indexBuffer = new IndexBuffer(device, {
      typedArray: indices,
    });
  }
}

export class Boid extends Geometry {
  constructor(device: GPUDevice) {
    //  Create a buffer with the vertices for a single cell.
    super("Boid");
    const vertices = new Float32Array([-0.01, -0.02, 0.01, -0.02, 0.0, 0.02]);
    this.vertexBuffer = new VertexBuffer(device, {
      bindPointIdx: 0,
      typedArray: vertices,
      stride: 2 * vertices.BYTES_PER_ELEMENT,
    }).addAtribute("position", { offset: 0, format: "float32x2", shaderLocation: 0 }); // @location(0)
  }
}
