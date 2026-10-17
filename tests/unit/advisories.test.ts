import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { advise } from "../../src/domain/layout/advisories";
import type { Item } from "../../src/domain/layout/items";
import { DEFAULT_THRESHOLDS, venueSampleItems } from "../../src/domain/scenario/scenario";

/** Bar stools hidden (the venue's default). */
const NONE = { barStools: false };

const t = (id: string, x: number, z: number): Item => ({
  id,
  libraryId: "table-rect",
  x,
  z,
  rotY: 0,
  options: { seats: 8 },
});

describe("advisories", () => {
  test("[LAY-08] a narrow aisle between chair backs is named, with its width and the setting", () => {
    // Rect 8: 2.8 × 0.9 m with 0.55 m chair zones → 2.0 m deep; 2.8 m apart leaves ≈ 0.8 m.
    const a = advise([t("a", 4, 4), t("b", 4, 6.8)], 16, DEFAULT_THRESHOLDS, venue, catalog, NONE);
    const aisle = a.find((x) => x.kind === "aisle");
    expect(aisle?.message).toBe("Aisle ≈ 0.8 m between table 1 and table 2 — below your 1.0 m setting");
    expect(aisle?.items).toEqual(["a", "b"]);
    // The highlight is the aisle itself: the 0.8 m strip between the chair zones, along the tables.
    expect(aisle?.label?.text).toBe("Aisle ≈ 0.8 m");
    const zs = (aisle?.area ?? []).map((p) => p[1]);
    const xs = (aisle?.area ?? []).map((p) => p[0]);
    expect(Math.min(...zs)).toBeCloseTo(5.0, 1);
    expect(Math.max(...zs)).toBeCloseTo(5.8, 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(2.8);
    const relaxed = advise(
      [t("a", 4, 4), t("b", 4, 6.8)],
      16,
      { ...DEFAULT_THRESHOLDS, aisleM: 0.7 },
      venue,
      catalog,
      NONE,
    );
    expect(relaxed.some((x) => x.kind === "aisle")).toBe(false);
  });

  test("[LAY-08] a table in front of the kitchen pass is flagged; the dance area there is not", () => {
    const pass: Item = { ...t("p", 7.0, 12.7), rotY: 0 };
    expect(advise([pass], 0, DEFAULT_THRESHOLDS, venue, catalog, NONE).map((x) => x.message)).toContain(
      "Clearance ≈ 0.6 m at the kitchen pass (table 1) — below your 1.2 m setting",
    );
    const floor: Item = {
      id: "f",
      libraryId: "dance-floor",
      x: 7,
      z: 12.5,
      rotY: 0,
      options: { width: 3, depth: 2 },
    };
    expect(
      advise([floor], 0, DEFAULT_THRESHOLDS, venue, catalog, NONE).some((x) => x.kind === "clearance"),
    ).toBe(false);
  });

  test("[LAY-08] dance area size is compared with 35% of guests at 0.45 m² each", () => {
    const items = venueSampleItems();
    // Sample dance area 4.8 × 3.0 ≈ 14.4 m²; 75 guests need ≈ 11.8 m²; 150 need ≈ 23.6 m².
    expect(advise(items, 75, DEFAULT_THRESHOLDS, venue, catalog, NONE).some((x) => x.kind === "dance")).toBe(
      false,
    );
    expect(
      advise(items, 150, DEFAULT_THRESHOLDS, venue, catalog, NONE).find((x) => x.kind === "dance")?.message,
    ).toBe("Dance area ≈ 14 m² — below the ≈ 24 m² your settings suggest for 150 guests");
  });

  test("[LAY-08] the venue sample plan: tightest aisles first; the garage-door tables pass", () => {
    const a = advise(venueSampleItems(), 75, DEFAULT_THRESHOLDS, venue, catalog, NONE);
    expect(a.map((x) => x.message)).toEqual([
      "Aisle ≈ 0.4 m between table 5 and table 6 — below your 1.0 m setting",
      "Aisle ≈ 0.6 m between table 4 and table 5 — below your 1.0 m setting",
      "Aisle ≈ 0.8 m between table 6 and table 7 — below your 1.0 m setting",
      "Clearance ≈ 0.4 m at the glass doors (the DJ booth) — below your 1.2 m setting",
    ]);
  });

  test("[LAY-12] shown venue furniture counts for the checks; hidden, it frees its floor", () => {
    // The stools take 0.6 m in front of the bar; chair backs 1.0 m further leave ≈ 0.4 m.
    const [x0, , x1, z1] = venue.data.bar.outer.value;
    const near = t("n", (x0 + x1) / 2, z1 + 2.0);
    const shown = advise([near], 0, DEFAULT_THRESHOLDS, venue, catalog, { barStools: true });
    expect(shown.map((x) => x.message)).toContain(
      "Aisle ≈ 0.4 m between table 1 and the bar stools — below your 1.0 m setting",
    );
    const hidden = advise([near], 0, DEFAULT_THRESHOLDS, venue, catalog, { barStools: false });
    expect(hidden.some((x) => x.message.includes("stools"))).toBe(false);
  });
});
