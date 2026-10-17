import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { placePeople } from "../../src/domain/layout/people";
import { type Item, footprint } from "../../src/domain/layout/items";
import { walkArea } from "../../src/domain/layout/walk";
import { venueSampleItems } from "../../src/domain/scenario/scenario";
import { pointInPolygon } from "../../src/domain/geometry";

const off = { barStools: false };
const items = venueSampleItems();
const dance = footprint(items.find((i) => i.libraryId === "dance-floor") as Item, catalog);

describe("people", () => {
  test("[PPL-01] 75 guests with 60 seats: 60 seated, 15 standing, none on the dance area at dinner", () => {
    const crowd = placePeople(items, 75, "dinner", venue, catalog, off, 1);
    expect(crowd.seated).toHaveLength(60);
    expect(crowd.standing).toHaveLength(15);
    expect(crowd.unplaced).toBe(0);
    expect(crowd.standing.some((p) => pointInPolygon([p.x, p.z], dance))).toBe(false);
    const free = walkArea(venue, items, catalog, off, 0.25);
    expect(crowd.standing.every((p) => free([p.x, p.z]))).toBe(true);
  });

  test("[PPL-01] fewer guests than seats: everyone sits", () => {
    const crowd = placePeople(items, 40, "dinner", venue, catalog, off, 1);
    expect(crowd.seated).toHaveLength(40);
    expect(crowd.standing).toHaveLength(0);
  });

  test("[PPL-01] at the party, standing guests fill the dance area first", () => {
    const crowd = placePeople(items, 75, "party", venue, catalog, off, 1);
    expect(crowd.standing.every((p) => pointInPolygon([p.x, p.z], dance))).toBe(true);
  });

  test("[PPL-02] the same layout, count and seed always give the same people", () => {
    const a = placePeople(items, 120, "dinner", venue, catalog, off, 7);
    const b = placePeople(items, 120, "dinner", venue, catalog, off, 7);
    expect(b).toEqual(a);
    const c = placePeople(items, 120, "dinner", venue, catalog, off, 8);
    expect(c.standing).not.toEqual(a.standing);
  });
});
