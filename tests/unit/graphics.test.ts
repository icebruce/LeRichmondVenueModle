import { describe, expect, test } from "vitest";
import { AutoTier, autoFor, autoRange, isMotionFrame } from "../../src/state/graphics";

const run = (auto: AutoTier, ms: number, total: number) => {
  for (let t = 0; t < total; t += ms) auto.frame(ms);
  return auto.tier;
};

describe("graphics tiers", () => {
  test("[PLT-03] Auto starts at High on a desktop and Balanced on a phone", () => {
    expect(autoRange(false)).toEqual({ start: "high", floor: "balanced" });
    expect(autoRange(true)).toEqual({ start: "balanced", floor: "battery" });
  });

  test("[PLT-03] about 2 s of slow frames steps one tier down, not before", () => {
    const auto = new AutoTier("high", "balanced");
    expect(run(auto, 33, 1800)).toBe("high");
    expect(run(auto, 33, 400)).toBe("balanced");
  });

  test("[PLT-03] Auto never goes below its floor", () => {
    expect(run(new AutoTier("high", "balanced"), 50, 20_000)).toBe("balanced");
    expect(run(new AutoTier("balanced", "battery"), 70, 20_000)).toBe("battery");
  });

  test("[PLT-03] pauses between motions are not slow frames", () => {
    expect(run(new AutoTier("high", "balanced"), 1000, 20_000)).toBe("high");
  });

  test("[PLT-03] a sustained good run steps up, but never back to a tier left for being slow", () => {
    const up = new AutoTier("balanced", "battery");
    expect(run(up, 16, 29_000)).toBe("balanced");
    expect(run(up, 16, 2000)).toBe("high");
    const back = new AutoTier("high", "balanced");
    run(back, 33, 2500);
    expect(back.tier).toBe("balanced");
    expect(run(back, 16, 60_000)).toBe("balanced");
  });

  test("[PLT-03] a few slow frames in a good run do not step down", () => {
    const auto = new AutoTier("high", "balanced");
    for (let i = 0; i < 200; i++) {
      run(auto, 16, 500);
      auto.frame(40);
    }
    expect(auto.tier).toBe("high");
  });

  test("[PLT-03] Auto resumes from the tier it last settled on here, never below its floor", () => {
    expect(autoFor(true, "battery").tier).toBe("battery");
    expect(autoFor(false, "balanced").tier).toBe("balanced");
    expect(autoFor(false, "battery").tier).toBe("high");
    expect(autoFor(true, null).tier).toBe("balanced");
  });

  test("[PLT-03] only frames inside a motion are timed: not the first after a pause, not the still frame", () => {
    expect(isMotionFrame(16, 17, false)).toBe(true);
    // A freeze inside a gesture counts.
    expect(isMotionFrame(16, 300, false)).toBe(true);
    expect(isMotionFrame(5000, 16, false)).toBe(false);
    expect(isMotionFrame(16, 160, true)).toBe(false);
  });
});
