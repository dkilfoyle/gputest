import { useEffect, useRef } from "react";
import "./App.css";

import { Boids } from "./Examples/Boids/Boids";
import { GameOfLife } from "./Examples/GameOfLife/GameOfLife2";

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    // Boids(canvas!);
    GameOfLife(canvas!);
  }, []);

  return <canvas ref={canvasRef} width="512" height="512"></canvas>;
}

export default App;
