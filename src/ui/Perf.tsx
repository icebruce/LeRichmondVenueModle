import { useState } from "react";
import { useStore } from "zustand";
import { frameStats, graphicsStore, perfStore } from "../state/graphics";
import { requestCamera } from "../state/view";
import { useStudio } from "../scene/context";

const TIER_NAMES = { high: "High", balanced: "Balanced", battery: "Battery saver" } as const;

const ms = (v: number) => `${v.toFixed(1)} ms`;
const thousands = (v: number) => (v >= 10_000 ? `${Math.round(v / 1000)}k` : String(v));

/**
 * The hidden `?perf` overlay (VISUAL_STATUS.md, V0): frame times while moving, draw calls,
 * triangles, a GPU memory estimate and the tier, with the two benchmark cameras and Copy, so the
 * owner can read the numbers on each device and paste them back.
 */
export function PerfOverlay() {
  const { editor } = useStudio();
  const p = useStore(perfStore);
  const g = useStore(graphicsStore);
  const [copied, setCopied] = useState(false);
  const f = frameStats(p.gaps, g.tier);
  const tier = `${g.choice === "auto" ? "Auto · " : ""}${TIER_NAMES[g.tier]}`;
  const lines = [
    `Tier ${tier}`,
    `Frames while moving: median ${ms(f.median)} · slow (≥ ${f.slowMs} ms) ${Math.round(f.slow * 100)}% · longest ${ms(f.longest)} · ${p.gaps.length} ${p.gaps.length === 1 ? "frame" : "frames"}`,
    `Draw calls ${p.calls} · triangles ${thousands(p.triangles)}`,
    `GPU ≈ ${Math.round(p.gpuBytes / 1e6)} MB · ${p.size[0]}×${p.size[1]} px at ${p.dpr}×`,
  ];
  const camera = (key: string | null) => {
    editor.setCamera("dollhouse");
    requestCamera(key);
  };
  const copy = async () => {
    const bench = new URLSearchParams(window.location.search).get("bench") ?? "none";
    const text = [...lines, `Benchmark ${bench}`, navigator.userAgent].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      editor.notify("Could not copy; select the numbers and copy them instead.");
    }
  };
  return (
    <section className="perf glass" aria-label="Performance" data-testid="perf">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      <div className="perf-actions">
        <span>Benchmark view</span>
        <button type="button" className="btn" onClick={() => camera(null)}>
          Dollhouse
        </button>
        <button type="button" className="btn" onClick={() => camera("benchEye")}>
          Eye level
        </button>
        <button type="button" className="btn primary" onClick={() => void copy()} data-testid="perf-copy">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}
