// `npm run bake` (visual stage V2, ADR-2): bakes the fixed room's evening and daylight light into
// light maps. Exports the room from the built app (`?bake-export`), bakes each set in Blender
// (`tools/blender/bake_room.py`), checks the result, encodes KTX2 (2K desktop, 1K phone) and writes
// `data/bake/manifest.json`, which the app checks against the room it builds before using the maps.
// Usage: npm run build && npm run bake [-- <samples>]   (BAKE_PYTHON: Python with `bpy`)
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";
import { chromium } from "@playwright/test";

const root = new URL("../..", import.meta.url).pathname;
const cache = join(root, "tools/.cache/bake");
const out = join(root, "public/assets/bake");
const samples = Number(process.argv[2] ?? 256);
const python = process.env.BAKE_PYTHON ?? "python3";
const PORT = 4180;
/** Brightest share of texels allowed to clip in the 8-bit map. */
const CLIP = 0.995;
/** A bake with more unlit texels than this inside the room's islands fails. */
const MAX_EMPTY = 0.01;
/** Light-map density the large walls need at 2K (texels per metre). */
const MIN_DENSITY = 30;

type Island = { x: number; y: number; u0: number; v0: number; u1: number; v1: number };
type Export = {
  geometryHash: string;
  inputsHash: string;
  atlas: { size: number; texelsPerMetre: number; islands: Island[] };
  glb: string;
};

mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

async function exportRoom(): Promise<Export> {
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: root });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const local = "/opt/pw-browsers/chromium";
    const browser = await chromium.launch({
      ...(existsSync(local) ? { executablePath: local } : {}),
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://localhost:${PORT}/?bare&fresh&bake-export&quality=high`);
    await page.waitForFunction(() => "__exportBake" in window, null, { timeout: 120_000 });
    // Walk view: every wall full height and the ceiling shown.
    await page.evaluate(() =>
      (
        window as unknown as { __studio: { editor: { setCamera: (m: string) => void } } }
      ).__studio.editor.setCamera("walk"),
    );
    await page.waitForTimeout(3000);
    const json = await page.evaluate(() =>
      (window as unknown as { __exportBake: () => Promise<string> }).__exportBake(),
    );
    await browser.close();
    return JSON.parse(json) as Export;
  } finally {
    server.kill();
  }
}

function bake(glb: string, mode: string, size: number): Float32Array {
  const file = join(cache, `${mode}.f32`);
  const r = spawnSync(
    python,
    [
      join(root, "tools/blender/bake_room.py"),
      glb,
      join(root, "data/venue_geometry.json"),
      file,
      String(size),
      String(samples),
      mode,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error(`bake ${mode} failed`);
  const b = readFileSync(file);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

/** Every texel inside an island, as an index into the map (rows top first). */
function* inside(atlas: Export["atlas"]) {
  for (const i of atlas.islands) {
    const w = Math.ceil((i.u1 - i.u0) * atlas.texelsPerMetre);
    const h = Math.ceil((i.v1 - i.v0) * atlas.texelsPerMetre);
    for (let y = Math.floor(i.y); y < i.y + h; y++)
      for (let x = Math.floor(i.x); x < i.x + w; x++) yield y * atlas.size + x;
  }
}

async function encode(px: Float32Array, atlas: Export["atlas"], mode: string) {
  const { size } = atlas;
  // Rows run top first in both the bake and the light-map UVs (three samples a KTX2 map unflipped).
  const peaks: number[] = [];
  let empty = 0;
  let count = 0;
  for (const t of inside(atlas)) {
    const k = t * 3;
    const m = Math.max(px[k] as number, px[k + 1] as number, px[k + 2] as number);
    if (m <= 0) empty++;
    peaks.push(m);
    count++;
  }
  if (empty / count > MAX_EMPTY)
    throw new Error(`${mode}: ${((empty / count) * 100).toFixed(1)}% of the room's texels are unlit`);
  peaks.sort((a, b) => a - b);
  const scale = peaks[Math.floor(peaks.length * CLIP)] as number;
  // 8-bit with a 2.2 gamma (stored as sRGB, decoded to linear on the GPU), so the dark end keeps its steps.
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < rgb.length; i++)
    rgb[i] = Math.round(255 * Math.pow(Math.min(1, (px[i] as number) / scale), 1 / 2.2));
  const files: Record<string, string> = {};
  for (const s of [size, size / 2]) {
    const png = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } })
      .resize(s, s)
      .png()
      .toBuffer();
    const ktx = await encodeToKTX2(new Uint8Array(png), {
      isUASTC: false,
      generateMipmap: true,
      isKTX2File: true,
      isSetKTX2SRGBTransferFunc: true,
      qualityLevel: 255,
      imageDecoder: async (buf: Uint8Array) => {
        const { data, info } = await sharp(Buffer.from(buf))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return { width: info.width, height: info.height, data: new Uint8Array(data) };
      },
    });
    const name = `${mode}_${s === size ? "2k" : "1k"}.ktx2`;
    writeFileSync(join(out, name), ktx);
    files[s === size ? "2k" : "1k"] = name;
    console.log(name, `${Math.round(ktx.length / 1024)} KB`);
  }
  console.log(`${mode}: scale ${scale.toFixed(3)}, ${empty} unlit of ${count} texels`);
  return { scale, files };
}

const room = await exportRoom();
if (room.atlas.texelsPerMetre < MIN_DENSITY)
  throw new Error(`light map at ${room.atlas.texelsPerMetre.toFixed(1)} texels/m, under ${MIN_DENSITY}`);
const glb = join(cache, "room.glb");
writeFileSync(glb, Buffer.from(room.glb, "base64"));
console.log(
  `exported: ${room.atlas.islands.length} islands at ${room.atlas.texelsPerMetre.toFixed(1)} texels/m`,
);
const sets: Record<string, { scale: number; files: Record<string, string> }> = {};
for (const mode of ["evening", "day"])
  sets[mode] = await encode(bake(glb, mode, room.atlas.size), room.atlas, mode);
const scriptHash = createHash("sha256")
  .update(readFileSync(join(root, "tools/blender/bake_room.py")))
  .digest("hex");
const manifest = { geometryHash: room.geometryHash, inputsHash: room.inputsHash, scriptHash, samples, sets };
mkdirSync(join(root, "data/bake"), { recursive: true });
writeFileSync(join(root, "data/bake/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("manifest written");
