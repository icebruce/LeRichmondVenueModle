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
  return finish(c);
}

/** One brass nail head on leather, centred: repeats along a trim strip (UVs: one nail per repeat). */
export function nailheadTexture(base: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(28, 28, 2, 32, 32, 20);
  g.addColorStop(0, "#f2dfaa");
  g.addColorStop(0.6, "#b8955f");
  g.addColorStop(1, "#4a3a22");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 20, 0, Math.PI * 2);
  ctx.fill();
  return finish(c);
}

/** Black steel with rows of rivet heads (girders, R02): one 0.6 m repeat holds a 4 × 4 grid. */
export function rivetTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = "#1c1e1f";
  ctx.fillRect(0, 0, size, size);
  const step = size / 4;
  for (let y = step / 2; y < size; y += step)
    for (let x = step / 2; x < size; x += step) {
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
      g.addColorStop(0, "#5a5d60");
      g.addColorStop(1, "#141516");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
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

/** Smooth vertical backdrop behind the room, `top` to `bottom` (DESIGN_GUIDE §9), dithered so it never bands. */
export function gradientTexture(top: string, bottom: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const data = ctx.getImageData(0, 0, 256, 256);
  const random = rng(7);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = random() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) data.data[i + k] = (data.data[i + k] as number) + n;
  }
  ctx.putImageData(data, 0, 0);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * The model's soft shadow beneath it: a blurred rounded rectangle filling `1 / spread` of the
 * texture, darkest in a band at its edge and fading to nothing before the texture's own edge.
 */
export function softShadowTexture(spread: number, rounding = 0.02): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const inner = size / spread;
  const at = (size - inner) / 2;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = at * 0.7;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(at, at, inner, inner, inner * rounding);
  ctx.fill();
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Where each picture sits on the back bar's card sheet (`backBarAtlas`), as [u0, v0, u1, v1]. The
 * three strips span the full width, so they repeat sideways along a shelf or rack.
 */
export const CARD = {
  bottles: [0, 0.75, 1, 1],
  glasses: [0, 0.5, 1, 0.75],
  rack: [0, 0.25, 1, 0.5],
  plant: [0, 0, 0.25, 0.25],
  grass: [0.25, 0, 0.5, 0.25],
  guitar: [0.5, 0, 0.75, 0.25],
  violin: [0.75, 0, 1, 0.25],
} as const;
/** Metres of shelf, rack or wall one strip of the sheet covers. */
export const CARD_STRIP_M = 1.2;

/**
 * The back bar's card sheet (V3): rows of backlit bottles and of glasses for the shelves behind the
 * front row, wine-rack bottle ends, and the plants, dried grasses and string instruments around
 * the canopy (R02, R03). `glow` is the same sheet as light: bottles and glasses glow, the rest not.
 */
export function backBarAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const [gc, gctx] = canvas(size);
  const r = rng(23);
  const band = size / 4;
  gctx.fillStyle = "#000";
  gctx.fillRect(0, 0, size, size);
  // Bottles (top strip, canvas rows 8..248): amber spirits, green wine, clear gin, brown liqueur.
  const tints = ["#b8742a", "#2f4a26", "#d9dccf", "#5a2c16", "#c98f3b", "#7a1f1f"];
  for (let x = 6; x < size - 40;) {
    if (r() < 0.12) {
      x += 20 + r() * 40;
      continue;
    }
    const w = 52 + r() * 26;
    const h = 150 + r() * 90;
    const neck = w * (0.22 + r() * 0.12);
    const body = h * (0.55 + r() * 0.15);
    const base = band - 8;
    const tint = tints[Math.floor(r() * tints.length)] ?? "#b8742a";
    for (const [g, colour] of [
      [ctx, tint],
      [gctx, tint],
    ] as const) {
      g.fillStyle = colour;
      g.beginPath();
      g.roundRect(x, base - body, w, body, 6);
      g.moveTo(x, base - body + 2);
      g.quadraticCurveTo(x + w / 2, base - body - w * 0.7, x + w, base - body + 2);
      g.fill();
      g.fillRect(x + w / 2 - neck / 2, base - h, neck, h - body);
    }
    // A pale label on most bottles, and a highlight down one side.
    if (r() < 0.7) {
      ctx.fillStyle = "rgba(236,226,204,0.85)";
      ctx.fillRect(x + 6, base - body * 0.75, w - 12, body * 0.35);
    }
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 6, base - body + 6, 5, body - 12);
    x += w + 4 + r() * 6;
  }
  // Glasses (second strip): stemmed glasses in rows, pale and see-through.
  for (let x = 30; x < size - 40; x += 74) {
    const base = 2 * band - 10;
    for (const [g, colour] of [
      [ctx, "rgba(214,222,226,0.8)"],
      [gctx, "rgba(120,110,90,1)"],
    ] as const) {
      g.fillStyle = colour;
      g.beginPath();
      g.ellipse(x, base - 118, 30, 50, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 3, base - 70, 6, 62);
      g.fillRect(x - 24, base - 10, 48, 8);
    }
  }
  // Wine rack (third strip): bottle ends in a wood lattice, one per cell; tiles both ways.
  ctx.fillStyle = "#5a3d24";
  ctx.fillRect(0, 2 * band, size, band);
  for (let y = 2 * band; y < 3 * band; y += 128)
    for (let x = 0; x < size; x += 128) {
      ctx.fillStyle = "#1c120b";
      ctx.fillRect(x + 8, y + 8, 112, 112);
      ctx.fillStyle = r() < 0.55 ? "#22331f" : "#4a1717";
      ctx.beginPath();
      ctx.arc(x + 64, y + 64, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0e0a07";
      ctx.beginPath();
      ctx.arc(x + 64, y + 64, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,210,0.45)";
      ctx.beginPath();
      ctx.arc(x + 50, y + 48, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  // Cells (bottom row): a leafy plant, dried grasses, a guitar and a violin.
  const cell = (i: number) => [i * band, 3 * band] as const;
  {
    const [cx, cy] = cell(0);
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
      const len = 60 + r() * 120;
      ctx.fillStyle = r() < 0.5 ? "#3f6a34" : "#57803f";
      ctx.save();
      ctx.translate(cx + band / 2, cy + band - 20);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, 10 + r() * 8, len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  {
    const [cx, cy] = cell(1);
    ctx.strokeStyle = "#cbb488";
    ctx.lineWidth = 3;
    for (let i = 0; i < 45; i++) {
      const tx = cx + band / 2 + (r() - 0.5) * 200;
      const ty = cy + 10 + r() * 80;
      ctx.beginPath();
      ctx.moveTo(cx + band / 2 + (r() - 0.5) * 20, cy + band - 6);
      ctx.quadraticCurveTo(cx + band / 2, cy + band / 2, tx, ty);
      ctx.stroke();
      ctx.fillStyle = "#e0cfa6";
      ctx.beginPath();
      ctx.ellipse(tx, ty, 5, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const instrument = (i: number, scale: number, wood: string) => {
    const [cx, cy] = cell(i);
    const x = cx + band / 2;
    ctx.fillStyle = wood;
    ctx.strokeStyle = "#1e130b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, cy + band - 62 * scale, 54 * scale, 52 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x, cy + band - 140 * scale, 40 * scale, 38 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(x - 7 * scale, cy + 6, 14 * scale, band - 150 * scale);
    ctx.fillRect(x - 12 * scale, cy + 4, 24 * scale, 30 * scale);
    ctx.beginPath();
    ctx.arc(x, cy + band - 112 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();
  };
  instrument(2, 1.4, "#7a4c25");
  instrument(3, 1.05, "#5c2a12");
  const map = finish(c);
  const glow = finish(gc);
  for (const t of [map, glow]) t.wrapT = THREE.ClampToEdgeWrapping;
  return { map, glow };
}

/** Antique mirror behind the shelves: bronze, foxed, brighter toward the top (R02, R03). */
export function antiqueMirrorTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const r = rng(41);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#c7ad80");
  g.addColorStop(0.55, "#6d5a42");
  g.addColorStop(1, "#3b3026");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(${40 + r() * 40},${30 + r() * 30},${20 + r() * 20},${0.08 + r() * 0.18})`;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, 2 + r() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = finish(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
