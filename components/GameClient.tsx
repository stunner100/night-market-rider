"use client";
import { useEffect, useRef, useState } from "react";
import { Engine } from "@/game/engine";
import { applyVisualQuality } from "@/game/visual-quality";
import { useGame } from "@/game/store";
import UI from "./UI";

// Keep the reference stable across Fast Refresh module replacements.
const clientScope = globalThis as unknown as { __nmEngineRef?: { current: Engine | null } };
export const engineRef = clientScope.__nmEngineRef ??= { current: null };

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
        // Development-only inspection hook for repeatable gameplay verification.
        if (process.env.NODE_ENV === 'development') {
          (window as unknown as { __nm?: unknown }).__nm = { engine, store: useGame };
        }

        // The legacy procedural-world helper produced a giant floor arrow after
        // the real Accra map was enabled. Route guidance now comes from the
        // smaller road-following chevrons instead.
        engine.world.arrowHelper.visible = false;

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
      if (process.env.NODE_ENV === "development") delete (window as unknown as { __nm?: unknown }).__nm;
    };
  }, []);

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div className="grade-overlay" aria-hidden="true" />
      <div className="vignette-overlay" aria-hidden="true" />
      <UI ready={ready} progress={progress} />
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        aria-label="OpenStreetMap attribution"
        style={{
          position: "fixed",
          right: 8,
          bottom: 6,
          zIndex: 70,
          color: "rgba(255,255,255,.68)",
          background: "rgba(0,0,0,.38)",
          padding: "3px 6px",
          borderRadius: 4,
          fontSize: 10,
          lineHeight: 1.2,
          textDecoration: "none",
          pointerEvents: "auto",
        }}
      >
        Map data © OpenStreetMap contributors
      </a>
    </div>
  );
}
