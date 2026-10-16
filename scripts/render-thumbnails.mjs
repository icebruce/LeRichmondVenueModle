#!/usr/bin/env node
// Render library thumbnails (LIB-11) from the running preview: npm run build && npm run preview, then
//   node scripts/render-thumbnails.mjs [id ...]
// Writes public/assets/thumbs/<id>.webp (needs ffmpeg for WebP; falls back to PNG next to it).
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const base = process.env.BASE_URL ?? "http://localhost:4173";
const out = join(root, "public/assets/thumbs");
mkdirSync(out, { recursive: true });
const all = readdirSync(join(root, "data/library"))
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(root, "data/library", f), "utf8")).items.map((i) => i.id));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
for (const id of ids) {
  await page.goto(`${base}/?fresh&thumb=${encodeURIComponent(id)}`);
  await page.waitForSelector("[data-testid=thumb-canvas] canvas", { timeout: 60000 });
  await page.waitForTimeout(5000);
  const png = join(out, `${id}.png`);
  await page.locator("[data-testid=thumb-canvas] canvas").screenshot({ path: png, omitBackground: true });
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      png,
      "-vf",
      "scale=160:160",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      join(out, `${id}.webp`),
    ]);
    rmSync(png);
    console.log("thumb", id);
  } catch {
    console.warn("ffmpeg unavailable; kept", png);
  }
}
await browser.close();
