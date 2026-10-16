#!/usr/bin/env node
// LIB-11: every library entry is complete, licensed, sized within family bounds and inside its budget.
// Schema validation itself runs in tests/unit (zod); this adds cross-file and asset checks.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "data/library");
const maxSize = {
  table: 6,
  chair: 1.5,
  linen: 1,
  eventPiece: 10,
  tableware: 0.6,
  candle: 1.5,
  floral: 3,
  plant: 4,
  light: 4,
  sign: 3,
};
const maxTriangles = {
  table: 40000,
  chair: 4000,
  linen: 4000,
  eventPiece: 20000,
  tableware: 3000,
  candle: 5000,
  floral: 20000,
  plant: 30000,
  light: 15000,
  sign: 5000,
};
const problems = [];
const seen = new Set();

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
  for (const e of data.items ?? []) {
    const where = `${file}:${e.id}`;
    if (seen.has(e.id)) problems.push(`${where} duplicate id`);
    seen.add(e.id);
    for (const k of [
      "name",
      "family",
      "placement",
      "sizeM",
      "model",
      "lowModel",
      "thumbnail",
      "source",
      "budget",
    ]) {
      if (e[k] === undefined) problems.push(`${where} missing ${k}`);
    }
    if (!e.source?.licence) problems.push(`${where} missing licence`);
    const m = maxSize[e.family];
    if (e.sizeM && m && Math.max(e.sizeM.w, e.sizeM.d, e.sizeM.h) > m)
      problems.push(`${where} larger than ${m} m`);
    const t = maxTriangles[e.family];
    if (e.budget && t && e.budget.triangles > t)
      problems.push(`${where} budget ${e.budget.triangles} > ${t} triangles`);
    if (e.budget && !(e.budget.phoneTriangles <= e.budget.triangles))
      problems.push(`${where} phone budget missing or above the desktop budget`);
    if (e.budget && t && e.budget.phoneTriangles > t / 4)
      problems.push(`${where} phone budget ${e.budget.phoneTriangles} > ${t / 4} triangles`);
    for (const m of [e.model, e.lowModel]) {
      if (m?.kind === "glb" && !existsSync(join(root, "public/assets", m.file)))
        problems.push(`${where} model file ${m.file} missing`);
    }
    if (process.argv.includes("--thumbs") && !existsSync(join(root, "public/assets", e.thumbnail))) {
      problems.push(`${where} thumbnail missing (npm run library:thumbs)`);
    }
  }
}

if (problems.length) {
  console.error(`Library check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Library check passed (${seen.size} items).`);
