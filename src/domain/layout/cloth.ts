/**
 * How a tablecloth hangs (V4, LIB-03), in metres: what the drape is built from, and what the chairs
 * and runners keep clear of.
 */

/** Table-top height of linen-covered tables. */
export const TABLE_TOP = 0.765;
/** A lap-length cloth hangs this far below the table top. */
export const LAP_DROP = 0.3;
/** Where the cloth stands off the table edge at the top. */
export const CLOTH_GAP = 0.012;
/** How much further out the cloth hangs at the hem than at the top. */
export const CLOTH_FLARE = 0.045;
/** Depth of the folds at the hem; a rectangle's corners gather up to `CORNER_GATHER` times deeper. */
export const CLOTH_FOLD = 0.018;
export const CORNER_GATHER = 1.5;
/** A floor-length hem floats this far above the floor. */
export const HEM_LIFT = 0.012;
/** How far a cloth hangs below the top, by length. */
export const clothDrop = (lap: boolean) => (lap ? LAP_DROP : TABLE_TOP - HEM_LIFT);
/**
 * The furthest a cloth reaches beyond the table edge, at its hem. Chair-gap rule: a tucked chair's
 * front stays outside this, so it never pierces a floor-length cloth.
 */
export const CLOTH_REACH = CLOTH_GAP + CLOTH_FLARE + CLOTH_FOLD * CORNER_GATHER;

/** The furthest the cloth reaches beyond the edge `share` of the way down its drop (0 top, 1 hem). */
export function clothReachAt(share: number): number {
  const t = Math.min(1, Math.max(0, share));
  return CLOTH_GAP + CLOTH_FLARE * Math.pow(t, 1.3) + CLOTH_FOLD * CORNER_GATHER * Math.pow(t, 1.5);
}
