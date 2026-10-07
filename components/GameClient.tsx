"use client";
import { useEffect, useRef, useState } from "react";
import { Engine } from "@/game/engine";
import { applyVisualQuality } from "@/game/visual-quality";
import { useGame } from "@/game/store";
import UI from "./UI";
import SiteFooter from "./SiteFooter";

export let engineRef: { current: Engine | null } = { current: null };

function loadingLabel(progress: number): string {
  if (progress < 25) return "Starting WebGL renderer…";
  if (progress < 55) return "Loading Accra street map…";
  if (progress < 80) return "Spawning traffic & night market…";
  if (progress < 100) return "Tuning your bike…";
  return "Opening the gate…";
}

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    let engine: Engine | null = null;
    let disposeVisualQuality: (() => void) | null = null;
    let cancelled = false;

    setProgress(18);
    const t1 = setTimeout(() => setProgress(42), 280);
    const t1b = setTimeout(() => setProgress(58), 520);
    const init = () => {
      if (!canvasRef.current || cancelled) return;
      try {
        setProgress(72);
        engine = new Engine(canvasRef.current);
        disposeVisualQuality = applyVisualQuality(engine);
        engineRef.current = engine;

        engine.world.arrowHelper.visible = false;

        if (engine.skyDome) engine.skyDome.visible = false;

        setProgress(96);
        setTimeout(() => {
          if (!cancelled) {
            setProgress(100);
            useGame.getState().set({ phase: "menu" });
            setTimeout(() => {
              if (!cancelled) setReady(true);
            }, 280);
          }
        }, 320);
      } catch (e) {
        console.error(e);
      }
    };

    const t2 = setTimeout(init, 420);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t1b);
      clearTimeout(t2);
      disposeVisualQuality?.();
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} aria-label="Night Market Rider 3D game view" />
      <UI ready={ready} progress={progress} loadingLabel={loadingLabel(progress)} />
      <SiteFooter />
    </div>
  );
}
