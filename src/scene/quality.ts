import { TIERS, type Tier, type TierChoice } from "../state/graphics";

export type Quality = "high" | "low";

/** Phones and touch-first tablets get the lighter scene (PLT-03). `?quality=` overrides for testing. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "high" || forced === "low") return forced;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  return coarse && small ? "low" : "high";
}

const AUTO_KEY = "richmond-studio/graphics-auto";

/**
 * The graphics choice: Auto, or `?tier=` for tests. The in-app setting waits on the owner's
 * approval of `docs/mockups/graphics.html`.
 */
export function tierChoice(): TierChoice {
  const v = new URLSearchParams(window.location.search).get("tier");
  return TIERS.find((t) => t === v) ?? "auto";
}

/** The tier Auto last settled on, on this device. */
export function rememberedAutoTier(): Tier | null {
  try {
    const v = window.localStorage.getItem(AUTO_KEY);
    return TIERS.find((t) => t === v) ?? null;
  } catch {
    return null;
  }
}

export function rememberAutoTier(tier: Tier) {
  try {
    window.localStorage.setItem(AUTO_KEY, tier);
  } catch {
    // Private browsing: Auto starts from the device default next time.
  }
}
