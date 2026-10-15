export type Quality = "high" | "low";

/** Phones and touch-first tablets get the lighter scene (PLT-03). `?quality=` overrides for testing. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "high" || forced === "low") return forced;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  return coarse && small ? "low" : "high";
}
