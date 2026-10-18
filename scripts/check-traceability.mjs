#!/usr/bin/env node
// TEST_STRATEGY §2: every M requirement of the given step(s) has a test titled with its ID,
// or is listed below as verified manually at a gate.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const stepArg = process.argv.indexOf("--step");
const steps = stepArg > 0 ? process.argv[stepArg + 1].split(",") : ["1"];

const MANUAL = {
  "VEN-01": "owner recognition at step 1 gate (fidelity review)",
  "LGT-01": "mood vs R08 at step 1 gate",
  "PLT-01": "owner devices at step gates",
  "PLT-03": "frame rate on real devices at step gates (draw calls and triangles are tested)",
  "REQ-03": "one real request delivered through a pull request at the step 3 gate (token reads are tested)",
  "REQ-04": "by design: request photos live only in the app's store; references/ media is gitignored",
};

const spec = readFileSync(join(root, "docs/PRODUCT_SPEC.md"), "utf8");
const required = [];
for (const line of spec.split("\n")) {
  const m = line.match(/^\| ([A-Z]{2,4}-\d{2}) \| (M|S|C) \| ([0-9–-]+) \|/);
  if (!m || m[2] !== "M") continue;
  const [lo, hi] = m[3].split(/[–-]/).map(Number);
  const range = hi ? [lo, hi] : [lo, lo];
  if (steps.some((s) => Number(s) >= range[0] && Number(s) <= range[1])) required.push(m[1]);
}

const tested = new Set();
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f))
      for (const m of readFileSync(p, "utf8").matchAll(/\[([A-Z]{2,4}-\d{2})\]/g)) tested.add(m[1]);
  }
};
walk(join(root, "tests"));

const missing = required.filter((id) => !tested.has(id) && !MANUAL[id]);
console.log(
  `Step ${steps.join(",")}: ${required.length} must-have requirements, ${required.length - missing.length} covered.`,
);
if (missing.length) {
  console.error(`No test or manual gate for: ${missing.join(", ")}`);
  process.exit(1);
}
