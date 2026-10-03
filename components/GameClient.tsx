"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "@/game/engine";
import { useGame } from "@/game/store";
import UI from "./UI";

export let engineRef: { current: Engine | null } = { current: null };

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(5);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let engine: Engine | null = null;
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    setReady(false);
    setFailure(null);
    setProgress(30);

    // Keep the staged loading affordance while the synchronous scene is built.
    const progressTimer = setTimeout(() => setProgress(65), 250);
    const initTimer = setTimeout(() => {
      if (!canvasRef.current || cancelled) return;
      try {
        engine = new Engine(canvasRef.current);
        engineRef.current = engine;
        setProgress(100);
        readyTimer = setTimeout(() => {
          if (!cancelled) {
            useGame.getState().set({ phase: "menu" });
            setReady(true);
          }
        }, 350);
      } catch (error) {
        console.error("Game initialization failed:", error);
        const detail = error instanceof Error ? error.message : String(error);
        setFailure(/webgl|context|graphics/i.test(detail)
          ? "WebGL graphics could not be initialized. Enable hardware acceleration, close other graphics-heavy tabs, or try a WebGL-capable browser."
          : "The game could not finish initializing. Check your browser, then retry.");
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(progressTimer);
      clearTimeout(initTimer);
      if (readyTimer) clearTimeout(readyTimer);
      engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setReady(false);
    setFailure(null);
    setProgress(5);
    setAttempt((value) => value + 1);
  }, []);

  return (
    <div id="game-root">
      <canvas key={attempt} id="game-canvas" ref={canvasRef} />
      <UI ready={ready} progress={progress} error={failure} onRetry={retry} />
    </div>
  );
}
