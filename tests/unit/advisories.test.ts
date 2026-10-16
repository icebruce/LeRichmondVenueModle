import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { advise } from "../../src/domain/layout/advisories";
import type { Item } from "../../src/domain/layout/items";
import { DEFAULT_THRESHOLDS, venueSampleItems } from "../../src/domain/scenario/scenario";

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
    // Rect 8: 3.0 × 0.9 m with 0.55 m chair zones → 2.0 m deep; 2.8 m apart leaves ≈ 0.8 m.
    const a = advise([t("a", 4, 4), t("b", 4, 6.8)], 16, DEFAULT_THRESHOLDS, venue, catalog);
    const aisle = a.find((x) => x.kind === "aisle");
    expect(aisle?.message).toBe("Aisle ≈ 0.8 m between table 1 and table 2 — below your 1.0 m setting");
    expect(aisle?.items).toEqual(["a", "b"]);
    // The highlight is the aisle itself: the 0.8 m strip between the chair zones, along the tables.
    expect(aisle?.label?.text).toBe("≈ 0.8 m");
    const zs = (aisle?.area ?? []).map((p) => p[1]);
    const xs = (aisle?.area ?? []).map((p) => p[0]);
    expect(Math.min(...zs)).toBeCloseTo(5.0, 1);
    expect(Math.max(...zs)).toBeCloseTo(5.8, 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(3);
    const relaxed = advise(
      [t("a", 4, 4), t("b", 4, 6.8)],
      16,
      { ...DEFAULT_THRESHOLDS, aisleM: 0.7 },
      venue,
      catalog,
    );
    expect(relaxed.some((x) => x.kind === "aisle")).toBe(false);
  });

  test("[LAY-08] a table in front of the kitchen pass is flagged; the dance floor there is not", () => {
    const pass: Item = { ...t("p", 7.0, 12.7), rotY: 0 };
    expect(advise([pass], 0, DEFAULT_THRESHOLDS, venue, catalog).map((x) => x.message)).toContain(
      "Table 1 ≈ 0.6 m from the kitchen pass — below your 1.2 m setting",
    );
    const floor: Item = {
      id: "f",
      libraryId: "dance-floor",
      x: 7,
      z: 12.5,
      rotY: 0,
      options: { width: 3, depth: 2 },
    };
    expect(advise([floor], 0, DEFAULT_THRESHOLDS, venue, catalog).some((x) => x.kind === "clearance")).toBe(
      false,
    );
  });

  test("[LAY-08] dance floor size is compared with 35% of guests at 0.45 m² each", () => {
    const items = venueSampleItems();
    // Sample floor 6.6 × 3.3 ≈ 21.8 m²; 75 guests need ≈ 11.8 m²; 150 need ≈ 23.6 m².
    expect(advise(items, 75, DEFAULT_THRESHOLDS, venue, catalog).some((x) => x.kind === "dance")).toBe(false);
    expect(
      advise(items, 150, DEFAULT_THRESHOLDS, venue, catalog).find((x) => x.kind === "dance")?.message,
    ).toBe("Dance floor ≈ 22 m² — below the ≈ 24 m² your settings suggest for 150 guests");
  });

  test("[LAY-08] the venue sample plan: tight aisles in both rows, and the DJ near the exit door", () => {
    const a = advise(venueSampleItems(), 75, DEFAULT_THRESHOLDS, venue, catalog);
    expect(a.map((x) => x.message)).toEqual([
      "Aisle ≈ 0.7 m between table 1 and table 2 — below your 1.0 m setting",
      "Aisle ≈ 0.7 m between table 2 and table 3 — below your 1.0 m setting",
      "Aisle ≈ 0.6 m between table 4 and table 5 — below your 1.0 m setting",
      "Aisle ≈ 0.4 m between table 5 and table 6 — below your 1.0 m setting",
      "Aisle ≈ 0.8 m between table 6 and table 7 — below your 1.0 m setting",
      "The DJ booth ≈ 0.4 m from the exit door — below your 1.2 m setting",
    ]);
  });

  test("[LAY-12] shown venue furniture counts for the checks; hidden, it frees its floor", () => {
    // Communal table with stools spans x 3.15–5.0; a turned table 8 at x 6.4 leaves ≈ 0.4 m.
    const near: Item = { ...t("n", 6.4, 5), rotY: Math.PI / 2 };
    const shown = advise([near], 0, DEFAULT_THRESHOLDS, venue, catalog, {
      communalTable: true,
      barStools: false,
    });
    expect(shown.map((x) => x.message)).toContain(
      "Aisle ≈ 0.4 m between table 1 and the communal high table — below your 1.0 m setting",
    );
    const hidden = advise([near], 0, DEFAULT_THRESHOLDS, venue, catalog, {
      communalTable: false,
      barStools: false,
    });
    expect(hidden.some((x) => x.message.includes("communal"))).toBe(false);
  });
});
