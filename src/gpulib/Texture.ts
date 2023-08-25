import { MyGPU } from "./interfaces";

export class Texture {
  protected texture: GPUTexture;
  public view: GPUTextureView;
  constructor(gpu: MyGPU, width: number, height: number) {
    this.texture = gpu.device.createTexture({
      size: { width, height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.view = this.texture.createView({ format: "rgba8unorm" });
  }
}
