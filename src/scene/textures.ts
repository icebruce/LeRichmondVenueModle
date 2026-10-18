import * as THREE from "three";

// Procedural textures for surfaces that have no fitting CC0 photo texture.
// All deterministic (seeded) so screenshots are stable.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** White marble with soft grey veins (bar top). */
export function marbleTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const r = rng(7);
  ctx.fillStyle = "#f1efea";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${200 + r() * 40},${198 + r() * 40},${195 + r() * 40},0.08)`;
    ctx.beginPath();
    ctx.arc(r() * size, r() * size, 10 + r() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let v = 0; v < 14; v++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * Math.PI * 2;
    const w = 0.6 + r() * 2.2;
    ctx.strokeStyle = `rgba(120,120,125,${0.18 + r() * 0.25})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 160; s++) {
      a += (r() - 0.5) * 0.35;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** Diamond-tufted upholstery with a nail-head border (banquettes, R06/R10). */
export function tuftedTexture(base: string): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const step = 64;
  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      const ox = (y / step) % 2 ? step / 2 : 0;
      const g = ctx.createRadialGradient(x + ox, y, 2, x + ox, y, step * 0.6);
      g.addColorStop(0, "rgba(0,0,0,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - step, y - step, step * 2, step * 2);
    }
  }
  ctx.fillStyle = "rgba(210,190,150,0.9)";
  for (let x = 6; x < size; x += 12) {
    ctx.beginPath();
    ctx.arc(x, 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/**
 * Generic stand-in artwork from a palette. The venue's real paintings are copyrighted and change
 * over time; these only echo their colour and energy (DESIGN_GUIDE §9).
 */
export function paintingTexture(palette: readonly string[], seed: number): THREE.CanvasTexture {
  const w = 1024;
  const [c, ctx] = canvas(w);
  const r = rng(seed);
  const pick = () => palette[Math.floor(r() * palette.length)] ?? "#888";
  const bg = ctx.createLinearGradient(0, 0, w, w);
  bg.addColorStop(0, palette[0] ?? "#222");
  bg.addColorStop(1, palette[1] ?? "#444");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.55;
    ctx.strokeStyle = pick();
    ctx.lineWidth = 12 + r() * 60;
    ctx.lineCap = "round";
    ctx.beginPath();
    const x = r() * w;
    const y = r() * w;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (r() - 0.5) * 500,
      y + (r() - 0.5) * 500,
      x + (r() - 0.5) * 500,
      y + (r() - 0.5) * 500,
      x + (r() - 0.5) * 600,
      y + (r() - 0.5) * 600,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

/** Soft radial glow sprite (candles, bulbs). */
export function glowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,220,160,1)");
  g.addColorStop(0.25, "rgba(255,190,110,0.55)");
  g.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c);
}
