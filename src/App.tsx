import { useEffect, useRef } from "react";
import "./App.css";

// import { GPUApp } from "./Examples/GameOfLife/GameOfLife";
// import { GPUApp } from "./Examples/Boids/Boids";
import { GPUApp } from "./Examples/Particles/Particles";

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    // Boids(canvas!);
    GPUApp(canvas!);
  }, []);

  return <canvas ref={canvasRef} width="512" height="512"></canvas>;
}

export default App;
