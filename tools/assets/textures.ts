// Room surfaces (visual stage V1): Poly Haven CC0 texture sets downloaded at 2K and encoded as
// WebP, a 2K set for desktops and a 1K set for phones. (Not KTX2: its decoder builds code at run
// time, which the site's CSP forbids; owner, 2026-10-18.) Usage: node tools/assets/textures.ts [cache_dir]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** Asset id → the maps the app uses. Real-world size of one repeat is in materials.ts (TILE). */
export const SETS: Record<string, readonly ("diff" | "nor_gl" | "rough")[]> = {
  large_floor_tiles_02: ["diff", "nor_gl", "rough"],
  old_wood_floor: ["diff", "nor_gl", "rough"],
  yellow_brick: ["diff", "nor_gl", "rough"],
  red_brick: ["diff", "nor_gl"],
  roof_planks: ["diff", "nor_gl"],
  wood_floor_worn: ["diff"],
};

/**
 * Only the colour of the big, close surfaces gets a 2K version (desktops); everything else is 1K on
 * every device, which keeps the desktop download near 4.6 MB and the phone's near 2.3 MB.
 */
const SHARP = new Set(["large_floor_tiles_02", "old_wood_floor", "yellow_brick", "red_brick"]);

/**
 * Colour corrections baked into a set's colour map. The venue's brick is a warm buff-tan and its
 * ceiling a honey pine (R01, R03, R10): both CC0 sets are more saturated, so they are toned down here, once.
 */
const TONE: Record<string, { saturation: number; brightness: number }> = {
  yellow_brick: { saturation: 0.8, brightness: 1.0 },
  roof_planks: { saturation: 0.7, brightness: 1.15 },
};

const root = new URL("../..", import.meta.url).pathname;
const out = join(root, "public/assets/textures");
const cache = process.argv[2] ?? join(root, "tools/.cache/polyhaven");

async function source(id: string, map: string): Promise<Buffer> {
  const file = join(cache, `${id}_${map}_2k.jpg`);
  if (!existsSync(file)) {
    mkdirSync(cache, { recursive: true });
    const url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${id}/${id}_${map}_2k.jpg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

for (const [id, maps] of Object.entries(SETS)) {
  for (const map of maps) {
    const src = await source(id, map);
    for (const size of map === "diff" && SHARP.has(id) ? [2048, 1024] : [1024]) {
      const tone = map === "diff" ? TONE[id] : undefined;
      const img = (tone ? sharp(src).modulate(tone) : sharp(src)).resize(size, size);
      // Normal maps keep more detail: their small errors show as bumpy shading.
      const webp = await img.webp({ quality: map === "nor_gl" ? 90 : 82 }).toBuffer();
      const name = `${id}_${map === "nor_gl" ? "nor" : map}_${size === 2048 ? "2k" : "1k"}.webp`;
      writeFileSync(join(out, name), webp);
      console.log(name, `${Math.round(webp.length / 1024)} KB`);
    }
  }
}
