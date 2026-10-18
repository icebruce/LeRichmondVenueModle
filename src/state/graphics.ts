import { createStore } from "zustand/vanilla";

/**
 * Graphics tiers (VISUAL_STATUS.md, Graphics tiers). A tier trims polish only, never the lighting
 * mood or the models: those follow the device (`Quality` in the scene). Battery saver is for phones.
 */
export type Tier = "high" | "balanced" | "battery";
export type TierChoice = "auto" | Tier;

export type Levers = {
  /** Device-pixel ratio cap while the view is still, and while it moves. */
  dpr: { still: number; moving: number };
  /** Frames per second at most. */
  fps: 60 | 30;
  /** Ambient occlusion: every frame, only in the frame drawn once the view stops, or none. */
  ao: "live" | "still" | "none";
  /** Bloom; at the same resolution in every tier (changing it at run time rebuilds the effect passes). */
  bloom: boolean;
  /** Shadow map size for the one shadow-casting light; 0 is no shadows. */
  shadow: number;
  /** Drawn directly, without effects (the renderer tone-maps). */
  direct: boolean;
};

export const LEVERS: Record<Tier, Levers> = {
  high: {
    dpr: { still: 2, moving: 2 },
    fps: 60,
    ao: "live",
    bloom: true,
    shadow: 2048,
    direct: false,
  },
  balanced: {
    dpr: { still: 2, moving: 1.25 },
    fps: 60,
    ao: "still",
    bloom: true,
    shadow: 1024,
    direct: false,
  },
  battery: {
    dpr: { still: 1.25, moving: 1.25 },
    fps: 30,
    ao: "none",
    bloom: false,
    shadow: 0,
    direct: true,
  },
};

/** Richest first. */
export const TIERS: readonly Tier[] = ["high", "balanced", "battery"];

/** A frame this long or longer is slow (under ~45 fps against a 60 fps target). */
const SLOW_MS = 22;
/** A frame this short or shorter keeps 60 fps. */
const GOOD_MS = 18;
/** Frames further apart than this are separate moments, not one motion. */
const GAP_MS = 250;
/** A frame this soon after the one before belongs to a motion (a drag, an orbit, a camera move). */
const MOTION_MS = 120;

/**
 * Whether a drawn frame is a frame of motion, to be timed: the frame before it must already have
 * been part of a motion (so a freeze inside a gesture counts, but not the first frame after a
 * pause) and it is not the one full-quality frame drawn once the view is still.
 */
export function isMotionFrame(previousGap: number, gap: number, still: boolean): boolean {
  return !still && previousGap < MOTION_MS && gap < 1000;
}
/** Slow time, net of good time, that steps down. */
const STEP_DOWN_MS = 2000;
/** Unbroken good time, summed over motions, that steps up. */
const STEP_UP_MS = 30_000;

/**
 * Auto: watches the time between frames drawn during motion. About 2 s of slow frames steps one
 * tier down; a sustained good run steps one up, but never back to a tier it left for being slow.
 * The lowest tier is `floor` (Balanced on a desktop, Battery saver on a phone).
 */
export class AutoTier {
  private slow = 0;
  private good = 0;
  private readonly left = new Set<Tier>();
  constructor(
    public tier: Tier,
    private readonly floor: Tier,
  ) {}

  /** A frame drawn `ms` after the previous one. Returns the tier now wanted. */
  frame(ms: number): Tier {
    if (ms > GAP_MS) return this.tier;
    const budget = LEVERS[this.tier].fps === 30 ? 2 : 1;
    if (ms >= SLOW_MS * budget) {
      this.slow += ms;
      this.good = 0;
    } else {
      this.slow = Math.max(0, this.slow - ms);
      if (ms <= GOOD_MS * budget) this.good += ms;
    }
    const i = TIERS.indexOf(this.tier);
    if (this.slow >= STEP_DOWN_MS && i < TIERS.indexOf(this.floor)) {
      this.left.add(this.tier);
      this.move(TIERS[i + 1] as Tier);
    } else if (this.good >= STEP_UP_MS && i > 0 && !this.left.has(TIERS[i - 1] as Tier)) {
      this.move(TIERS[i - 1] as Tier);
    }
    return this.tier;
  }

  private move(to: Tier) {
    this.tier = to;
    this.slow = 0;
    this.good = 0;
  }
}

/** Where Auto starts and how low it may go: by device class (desktop or phone). */
export function autoRange(phone: boolean): { start: Tier; floor: Tier } {
  return phone ? { start: "balanced", floor: "battery" } : { start: "high", floor: "balanced" };
}

/** Auto for this device: from the tier it last settled on here, if still allowed. */
export function autoFor(phone: boolean, remembered: Tier | null): AutoTier {
  const { start, floor } = autoRange(phone);
  const ok = remembered && TIERS.indexOf(remembered) <= TIERS.indexOf(floor);
  return new AutoTier(ok ? remembered : start, floor);
}

/** The tier in use, whether the view is moving, and the choice it comes from (read by `?perf`). */
export const graphicsStore = createStore<{
  choice: TierChoice;
  tier: Tier;
  moving: boolean;
  /** Test hook: keep the view counted as moving (the budget test measures a frame of motion). */
  hold: boolean;
}>(() => ({
  choice: "auto",
  tier: "high",
  moving: false,
  hold: false,
}));

/** `?perf` readings (VISUAL_STATUS.md, V0): published a few times a second while frames are drawn. */
export type PerfReadings = {
  /** Time between frames drawn during motion (ms), most recent last. */
  gaps: number[];
  calls: number;
  triangles: number;
  /** Estimated GPU memory: geometry, textures, shadow map and frame buffers (bytes). */
  gpuBytes: number;
  dpr: number;
  size: [number, number];
};

export const perfStore = createStore<PerfReadings>(() => ({
  gaps: [],
  calls: 0,
  triangles: 0,
  gpuBytes: 0,
  dpr: 1,
  size: [0, 0],
}));

/** Median, slow share (and its threshold) and longest of the motion frames, for `?perf`. */
export function frameStats(gaps: readonly number[], tier: Tier) {
  const slowMs = SLOW_MS * (LEVERS[tier].fps === 30 ? 2 : 1);
  if (!gaps.length) return { median: 0, slow: 0, longest: 0, slowMs };
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    slowMs,
    median: sorted[Math.floor(sorted.length / 2)] as number,
    slow: gaps.filter((g) => g >= slowMs).length / gaps.length,
    longest: sorted[sorted.length - 1] as number,
  };
}
