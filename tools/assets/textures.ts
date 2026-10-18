// Room surfaces (visual stage V1): Poly Haven CC0 texture sets downloaded at 2K and encoded as
// KTX2 (Basis ETC1S, mipmapped), a 2K set for desktops and a 1K set for phones. Compressed on the
// GPU as well as on the wire. Usage: node tools/assets/textures.ts [cache_dir]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";

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
 * Colour corrections baked into a set's colour map. The venue's brick is a pale buff and its ceiling
 * a pale honey pine (R01, R03, R07): both CC0 sets are warmer, so they are toned down here, once.
 */
const TONE: Record<string, { saturation: number; brightness: number }> = {
  yellow_brick: { saturation: 0.55, brightness: 1.12 },
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

const decode = async (buf: Uint8Array) => {
  const { data, info } = await sharp(Buffer.from(buf))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};

for (const [id, maps] of Object.entries(SETS)) {
  for (const map of maps) {
    const src = await source(id, map);
    for (const size of map === "diff" && SHARP.has(id) ? [2048, 1024] : [1024]) {
      const tone = map === "diff" ? TONE[id] : undefined;
      const png = await (tone ? sharp(src).modulate(tone) : sharp(src)).resize(size, size).png().toBuffer();
      const ktx = await encodeToKTX2(new Uint8Array(png), {
        isUASTC: false,
        generateMipmap: true,
        isKTX2File: true,
        // Colour maps are sRGB; normal and roughness maps are data.
        isSetKTX2SRGBTransferFunc: map === "diff",
        isNormalMap: map === "nor_gl",
        qualityLevel: map === "diff" ? 160 : 128,
        imageDecoder: decode,
      });
      const name = `${id}_${map === "nor_gl" ? "nor" : map}_${size === 2048 ? "2k" : "1k"}.ktx2`;
      writeFileSync(join(out, name), ktx);
      console.log(name, `${Math.round(ktx.length / 1024)} KB`);
    }
  }
}
