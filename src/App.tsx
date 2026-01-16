import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type ThemeBG = "night" | "sunset" | "snow";
type ColorPreset = "spring" | "autumn" | "winter" | "neon";

type Settings = {
  depth: number;
  angle: number;
  length: number;
  shrink: number;
  thickness: number;
  randomness: number;

  leafMode: boolean;

  // NEW
  animateWind: boolean;
  windStrength: number; // 0 to 12 degrees
  windSpeed: number; // 0.2 to 3.0

  growAnimation: boolean;
  growSpeed: number; // segments per frame
  preset: ColorPreset;
};

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: number;
  depthLeft: number;
  totalDepth: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [settings, setSettings] = useState<Settings>({
    depth: 11,
    angle: 25,
    length: 150,
    shrink: 0.67,
    thickness: 10,
    randomness: 2,

    leafMode: true,

    animateWind: true,
    windStrength: 4,
    windSpeed: 1.2,

    growAnimation: true,
    growSpeed: 80,

    preset: "spring",
  });

  const [bg, setBg] = useState<ThemeBG>("night");

  // used for wind sway
  const windTimeRef = useRef(0);

  // used for grow animation
  const segmentsRef = useRef<Segment[]>([]);
  const growIndexRef = useRef(0);

  const rafRef = useRef<number | null>(null);

  const bgColor = useMemo(() => {
    if (bg === "night") return "#0b1020";
    if (bg === "sunset") return "#1b0f2e";
    return "#0b1220";
  }, [bg]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
  }

  function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (bg === "night") {
      grad.addColorStop(0, "#050816");
      grad.addColorStop(1, "#0b1020");
    } else if (bg === "sunset") {
      grad.addColorStop(0, "#2a0a3d");
      grad.addColorStop(1, "#13061f");
    } else {
      grad.addColorStop(0, "#0a1222");
      grad.addColorStop(1, "#06101e");
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // stars / snow dots
    const dots = 120;
    ctx.globalAlpha = bg === "snow" ? 0.35 : 0.25;

    for (let i = 0; i < dots; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 1.5 + 0.2;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function presetColors(preset: ColorPreset) {
    switch (preset) {
      case "spring":
        return {
          trunk: "#a16207",
          branch: "#16a34a",
          leaf: "#22c55e",
          glow: false,
        };
      case "autumn":
        return {
          trunk: "#92400e",
          branch: "#ea580c",
          leaf: "#f59e0b",
          glow: false,
        };
      case "winter":
        return {
          trunk: "#6b7280",
          branch: "#94a3b8",
          leaf: "#e5e7eb",
          glow: false,
        };
      case "neon":
        return {
          trunk: "#a855f7",
          branch: "#22d3ee",
          leaf: "#f472b6",
          glow: true,
        };
      default:
        return {
          trunk: "#a16207",
          branch: "#16a34a",
          leaf: "#22c55e",
          glow: false,
        };
    }
  }

  function branchColor(depthLeft: number, totalDepth: number) {
    const ratio = depthLeft / totalDepth;
    const c = presetColors(settings.preset);

    if (!settings.leafMode) return c.branch;

    if (ratio > 0.55) return c.trunk;
    if (ratio > 0.25) return c.branch;
    return c.leaf;
  }

  // 🌬️ Wind sway angle
  function getWindAngle(depthLeft: number, totalDepth: number) {
    if (!settings.animateWind) return 0;

    // less sway for trunk, more for leaves
    const leafFactor = 1 - depthLeft / totalDepth; // 0 trunk -> 1 leaves
    const sway = settings.windStrength * leafFactor;

    // time-based oscillation
    const t = windTimeRef.current;
    return Math.sin(t) * sway;
  }

  // Build segments list once (for grow animation)
  function buildSegments() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    segmentsRef.current = [];
    growIndexRef.current = 0;

    const startX = w / 2;
    const startY = h - 20;

    const totalDepth = settings.depth;

    function collect(
      x: number,
      y: number,
      len: number,
      angleDeg: number,
      depthLeft: number,
      thick: number
    ) {
      if (depthLeft <= 0 || len < 2) return;

      // randomness baked in once so tree stays consistent while growing
      const randomAngle = (Math.random() * 2 - 1) * settings.randomness;
      const a = ((angleDeg + randomAngle) * Math.PI) / 180;

      const x2 = x + len * Math.cos(a);
      const y2 = y - len * Math.sin(a);

      segmentsRef.current.push({
        x1: x,
        y1: y,
        x2,
        y2,
        thick,
        depthLeft,
        totalDepth,
      });

      const newLen = len * settings.shrink;
      const newThick = thick * 0.75;

      collect(
        x2,
        y2,
        newLen,
        angleDeg - settings.angle,
        depthLeft - 1,
        newThick
      );
      collect(
        x2,
        y2,
        newLen,
        angleDeg + settings.angle,
        depthLeft - 1,
        newThick
      );
    }

    collect(startX, startY, settings.length, 90, settings.depth, settings.thickness);
  }

  function drawSegmentsFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
    clearCanvas(ctx, w, h);
    drawBackground(ctx, w, h);

    const c = presetColors(settings.preset);

    if (c.glow) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = c.leaf;
    } else {
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    const segs = segmentsRef.current;
    const total = segs.length;

    const limit = settings.growAnimation
      ? clamp(growIndexRef.current, 0, total)
      : total;

    for (let i = 0; i < limit; i++) {
      const s = segs[i];

      // Apply wind sway by rotating the end point slightly around start point
      const wind = getWindAngle(s.depthLeft, s.totalDepth);
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;

      const baseAngle = Math.atan2(-dy, dx); // y axis inverted in canvas math
      const len = Math.sqrt(dx * dx + dy * dy);

      const newAngle = baseAngle + (wind * Math.PI) / 180;

      const x2 = s.x1 + len * Math.cos(newAngle);
      const y2 = s.y1 - len * Math.sin(newAngle);

      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = branchColor(s.depthLeft, s.totalDepth);
      ctx.lineWidth = s.thick;
      ctx.lineCap = "round";
      ctx.stroke();

      // leaf dot
      if (settings.leafMode && s.depthLeft <= 2) {
        ctx.beginPath();
        ctx.arc(x2, y2, clamp(s.thick * 0.55, 1.2, 5), 0, Math.PI * 2);
        ctx.fillStyle = c.leaf;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // advance growing
    if (settings.growAnimation && growIndexRef.current < total) {
      growIndexRef.current += settings.growSpeed;
    }
  }

  function startLoop() {
    stopLoop();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const tick = () => {
      // wind time update
      windTimeRef.current += 0.02 * settings.windSpeed;

      drawSegmentsFrame(ctx, w, h);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function drawTreeOnce() {
    // for manual draw: rebuild + render full
    buildSegments();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    growIndexRef.current = segmentsRef.current.length;
    drawSegmentsFrame(ctx, w, h);
  }

  function randomize() {
    setSettings((prev) => ({
      ...prev,
      depth: Math.floor(Math.random() * 6) + 9,
      angle: Math.floor(Math.random() * 35) + 10,
      length: Math.floor(Math.random() * 90) + 120,
      shrink: Number((Math.random() * 0.18 + 0.58).toFixed(2)),
      thickness: Math.floor(Math.random() * 10) + 6,
      randomness: Math.floor(Math.random() * 8),
      leafMode: Math.random() > 0.2,
    }));
  }

  function downloadPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "fractal-tree.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // rebuild segments when structure changes
  useEffect(() => {
    buildSegments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.depth,
    settings.angle,
    settings.length,
    settings.shrink,
    settings.thickness,
    settings.randomness,
  ]);

  // animation loop (wind/grow)
  useEffect(() => {
    startLoop();
    return () => stopLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.animateWind,
    settings.windStrength,
    settings.windSpeed,
    settings.growAnimation,
    settings.growSpeed,
    settings.leafMode,
    settings.preset,
    bg,
  ]);

  return (
    <div className="page" style={{ background: bgColor }}>
      <header className="header">
        <h1>🌳 Fractal Tree Generator</h1>
        <p className="subtitle">
          Wind sway + growing animation + seasonal color presets (React + TS)
        </p>
      </header>

      <main className="layout">
        <section className="canvasCard">
          <canvas ref={canvasRef} width={1000} height={650} />
          <div className="canvasActions">
            <button className="btn primary" onClick={drawTreeOnce}>
              Draw
            </button>
            <button className="btn" onClick={randomize}>
              Random
            </button>
            <button className="btn" onClick={downloadPNG}>
              Download PNG
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Controls</h2>

            <div className="themeRow">
              <label className="label">Theme</label>
              <select
                className="select"
                value={bg}
                onChange={(e) => setBg(e.target.value as ThemeBG)}
              >
                <option value="night">Night</option>
                <option value="sunset">Sunset</option>
                <option value="snow">Snow</option>
              </select>
            </div>
          </div>

          {/* 🎨 Color Presets */}
          <div className="control">
            <div className="row">
              <label className="label">Color Preset</label>
              <span className="value">{settings.preset}</span>
            </div>
            <select
              className="select"
              value={settings.preset}
              onChange={(e) => update("preset", e.target.value as ColorPreset)}
            >
              <option value="spring">Spring</option>
              <option value="autumn">Autumn</option>
              <option value="winter">Winter</option>
              <option value="neon">Neon</option>
            </select>
          </div>

          {/* 🌱 Grow Animation */}
          <div className="toggleRow">
            <input
              id="growAnimation"
              type="checkbox"
              checked={settings.growAnimation}
              onChange={(e) => update("growAnimation", e.target.checked)}
            />
            <label htmlFor="growAnimation">Growing Animation</label>
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Grow Speed</label>
              <span className="value">{settings.growSpeed}</span>
            </div>
            <input
              type="range"
              min={10}
              max={250}
              value={settings.growSpeed}
              onChange={(e) => update("growSpeed", Number(e.target.value))}
            />
          </div>

          {/* 🌬️ Wind */}
          <div className="toggleRow">
            <input
              id="animateWind"
              type="checkbox"
              checked={settings.animateWind}
              onChange={(e) => update("animateWind", e.target.checked)}
            />
            <label htmlFor="animateWind">Wind Animation</label>
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Wind Strength</label>
              <span className="value">{settings.windStrength}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              value={settings.windStrength}
              onChange={(e) => update("windStrength", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Wind Speed</label>
              <span className="value">{settings.windSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={settings.windSpeed}
              onChange={(e) => update("windSpeed", Number(e.target.value))}
            />
          </div>

          {/* Base Controls */}
          <div className="control">
            <div className="row">
              <label className="label">Depth</label>
              <span className="value">{settings.depth}</span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={settings.depth}
              onChange={(e) => update("depth", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Angle</label>
              <span className="value">{settings.angle}°</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              value={settings.angle}
              onChange={(e) => update("angle", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Branch Length</label>
              <span className="value">{settings.length}</span>
            </div>
            <input
              type="range"
              min={60}
              max={240}
              value={settings.length}
              onChange={(e) => update("length", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Shrink Factor</label>
              <span className="value">{settings.shrink.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={0.85}
              step={0.01}
              value={settings.shrink}
              onChange={(e) => update("shrink", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Thickness</label>
              <span className="value">{settings.thickness}</span>
            </div>
            <input
              type="range"
              min={1}
              max={22}
              value={settings.thickness}
              onChange={(e) => update("thickness", Number(e.target.value))}
            />
          </div>

          <div className="control">
            <div className="row">
              <label className="label">Randomness</label>
              <span className="value">{settings.randomness}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              value={settings.randomness}
              onChange={(e) => update("randomness", Number(e.target.value))}
            />
          </div>

          <div className="toggleRow">
            <input
              id="leafMode"
              type="checkbox"
              checked={settings.leafMode}
              onChange={(e) => update("leafMode", e.target.checked)}
            />
            <label htmlFor="leafMode">Leaf Mode</label>
          </div>

          <div className="tips">
            <p>
              <b>Tip:</b> Try preset <b>Neon</b> + Wind ON + Grow ON for the best
              portfolio effect.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Built with React + TypeScript + HTML Canvas</span>
      </footer>
    </div>
  );
}
