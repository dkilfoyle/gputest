import { createContext, useContext, useEffect, useRef } from "react";

const WebGPUContext = createContext<GPUDevice | null>(null);

export const WebGPU = async (children: React.ReactNode) => {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = (await adapter?.requestDevice()) as GPUDevice;
  return <WebGPUContext.Provider value={device}>{children}</WebGPUContext.Provider>;
};

export const Canvas = () => {
  const device = useContext(WebGPUContext)!;
  const canvasRef = useRef<HTMLCanvasElement | null>(null!);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const canvasContext = canvasRef.current!.getContext("webgpu") as unknown as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    // const devicePixelRatio = window.devicePixelRatio || 1;
    const devicePixelRatio = 1;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    canvasContext.configure({
      device,
      format,
      alphaMode: "opaque",
    });
  });

  return <canvas ref={canvasRef} width="512" height="512"></canvas>;
};
