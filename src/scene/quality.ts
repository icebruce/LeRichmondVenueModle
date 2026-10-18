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
const CHOICE_KEY = "richmond-studio/graphics";

/** The graphics choice: `?tier=` (tests), else the one saved on this device, else Auto. */
export function tierChoice(): TierChoice {
  const v = new URLSearchParams(window.location.search).get("tier") ?? read(CHOICE_KEY);
  return TIERS.find((t) => t === v) ?? "auto";
}

export function rememberTierChoice(choice: TierChoice) {
  write(CHOICE_KEY, choice);
}

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing: the choice lasts for this visit only.
  }
};

/** The tier Auto last settled on, on this device. */
export function rememberedAutoTier(): Tier | null {
  const v = read(AUTO_KEY);
  return TIERS.find((t) => t === v) ?? null;
}

export function rememberAutoTier(tier: Tier) {
  write(AUTO_KEY, tier);
}
