import { dominantColours } from "../domain/library/imported";

/** Longest edge and size of a stored photo (ARCHITECTURE §6.3). */
const MAX_EDGE = 1600;
export const MAX_BYTES = 500_000;

/** A crop as fractions of the photo (0–1), so it does not depend on the shown size. */
export type Crop = { x: number; y: number; w: number; h: number };

export type PreparedPhoto = {
  /** The cropped photo, ≤ 1600 px and ≤ 500 KB; re-encoding drops EXIF data (location, camera). */
  blob: Blob;
  /** A small JPEG for library lists. */
  thumb: string;
  colours: string[];
  /** Height over width of the crop, in pixels. */
  aspect: number;
};

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Decodes a photo the right way up (phone photos carry their rotation in EXIF). */
export async function decodePhoto(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file isn't a photo this browser can open.");
  }
}

function draw(source: ImageBitmap, crop: Crop, maxEdge: number): HTMLCanvasElement {
  const sw = Math.max(1, crop.w * source.width);
  const sh = Math.max(1, crop.h * source.height);
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.drawImage(
    source,
    crop.x * source.width,
    crop.y * source.height,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Crops, shrinks and re-encodes a photo for storage (IMP-03, §6.3), and reads its colours. */
export async function preparePhoto(source: ImageBitmap, crop: Crop): Promise<PreparedPhoto> {
  let edge = MAX_EDGE;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 6 && !blob; attempt++) {
    const canvas = draw(source, crop, edge);
    for (const q of [0.85, 0.7, 0.55]) {
      // WebP where the browser encodes it (Safari may hand back PNG), JPEG otherwise.
      const webp = await encode(canvas, "image/webp", q);
      const b = webp?.type === "image/webp" ? webp : await encode(canvas, "image/jpeg", q);
      if (b && b.size <= MAX_BYTES) {
        blob = b;
        break;
      }
    }
    edge = Math.round(edge * 0.75);
  }
  if (!blob) throw new Error("That photo could not be made small enough to save.");
  const small = draw(source, crop, 160);
  const thumb = small.toDataURL("image/jpeg", 0.8);
  const sample = draw(source, crop, 96);
  const data = (sample.getContext("2d") as CanvasRenderingContext2D).getImageData(
    0,
    0,
    sample.width,
    sample.height,
  ).data;
  return {
    blob,
    thumb,
    colours: dominantColours(data, sample.width, sample.height),
    aspect: (crop.h * source.height) / (crop.w * source.width),
  };
}
