import { useEffect, useRef } from "react";
import { engine } from "@/audio/engine";

/**
 * Live spectrum strip — reads the master analyser straight from the audio
 * engine and paints with a canvas, so it never re-renders React while playing.
 */
export function Visualizer({ height = 30, bars = 56, className }: { height?: number; bars?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const smooth = useRef<number[]>(Array.from({ length: bars }, () => 0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let alive = true;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const styles = getComputedStyle(document.documentElement);
    const readVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

    const draw = () => {
      if (!alive) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const spectrum = engine.spectrumData();
      const gap = Math.max(2, w / bars / 3.2);
      const barW = (w - gap * (bars - 1)) / bars;

      const fg = readVar("--fg", "#ffffff");

      for (let i = 0; i < bars; i++) {
        let target = 0;
        if (spectrum && engine.playing) {
          const from = Math.floor(Math.pow(i / bars, 1.55) * (spectrum.length * 0.72));
          const to = Math.max(from + 1, Math.floor(Math.pow((i + 1) / bars, 1.55) * (spectrum.length * 0.72)));
          let sum = 0;
          for (let k = from; k < to; k++) sum += spectrum[k];
          target = sum / (to - from) / 255;
        } else {
          // idle: gentle breathing silhouette so the strip never looks dead
          const t = performance.now() / 1400;
          target = 0.13 + 0.17 * (0.5 + 0.5 * Math.sin(t + i * 0.42));
        }
        smooth.current[i] += (target - smooth.current[i]) * (engine.playing ? 0.42 : 0.09);
        const value = Math.max(0.02, Math.min(1, smooth.current[i]));
        const barH = Math.max(2, value * h * 0.95);
        const x = i * (barW + gap);
        const y = h - barH;

        // monochrome ink: opacity carries the dynamics
        ctx.globalAlpha = (engine.playing ? 0.22 : 0.12) + value * 0.7;
        ctx.fillStyle = fg;
        const r = Math.min(barW / 2, 3);
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, h);
        ctx.closePath();
        ctx.fill();


      }
      ctx.globalAlpha = 1;
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      observer.disconnect();
    };
  }, [bars]);

  return <canvas ref={canvasRef} className={className} style={{ height, width: "100%" }} aria-hidden="true" />;
}
