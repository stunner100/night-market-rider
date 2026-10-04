"use client";
import { useEffect, useRef, useState } from "react";
import { Engine } from "@/game/engine";
import { applyVisualQuality } from "@/game/visual-quality";
import { useGame } from "@/game/store";
import UI from "./UI";

export let engineRef: { current: Engine | null } = { current: null };

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    let engine: Engine | null = null;
    let disposeVisualQuality: (() => void) | null = null;
    let cancelled = false;

    setProgress(30);
    const t1 = setTimeout(() => setProgress(65), 250);
    const init = () => {
      if (!canvasRef.current || cancelled) return;
      try {
        engine = new Engine(canvasRef.current);
        disposeVisualQuality = applyVisualQuality(engine);
        engineRef.current = engine;
        setProgress(100);
        setTimeout(() => {
          if (!cancelled) {
            useGame.getState().set({ phase: "menu" });
            setReady(true);
          }
        }, 350);
      } catch (e) {
        console.error(e);
      }
    };

    const t2 = setTimeout(init, 400);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      disposeVisualQuality?.();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <UI ready={ready} progress={progress} />
    </div>
  );
}
