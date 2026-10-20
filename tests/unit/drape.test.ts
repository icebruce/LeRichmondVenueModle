import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { type Outline, drapeGeometry, drapeVertexCount } from "../../src/scene/items/drape";
import { CLOTH_REACH, HEM_LIFT, LAP_DROP } from "../../src/domain/layout/cloth";
import { CHAIR_FRONT_REACH } from "../../src/scene/items/geometry";
import { rectTable, roundTable } from "../../src/domain/library/sizing";
import { shapeOf } from "../../src/domain/layout/items";
import { catalog } from "./fixtures";

const TOP = 0.75;

/** How far each vertex of the bottom row lies outside the table outline, horizontally. */
function hem(g: THREE.BufferGeometry, outline: Outline): { reach: number[]; points: THREE.Vector3[] } {
  const pos = g.getAttribute("position");
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (p.y < TOP - (TOP - HEM_LIFT) + 0.001) points.push(p);
  }
  const reach = points.map((p) =>
    outline.kind === "round"
      ? Math.hypot(p.x, p.z) - outline.radius
      : Math.max(Math.abs(p.x) - outline.length / 2, Math.abs(p.z) - outline.width / 2),
  );
  return { reach, points };
}

describe("table drapes", () => {
  test("[LIB-03] a drape has the vertices it is built with, for every table size", () => {
    for (const seats of [4, 6, 8, 10]) {
      const o: Outline = { kind: "round", radius: roundTable(seats).diameter / 2 };
      expect(drapeGeometry(o, TOP, TOP - HEM_LIFT).getAttribute("position").count).toBe(drapeVertexCount(o));
    }
    for (const seats of [4, 8, 12, 16, 20]) {
      const t = rectTable(seats, false);
      const o: Outline = { kind: "rect", length: t.length, width: t.width };
      const n = drapeVertexCount(o);
      expect(drapeGeometry(o, TOP, TOP - HEM_LIFT).getAttribute("position").count).toBe(n);
      // Longer tables get more columns, so folds stay about as fine on every size.
      expect(n).toBeLessThan(5000);
    }
  });

  test("[LIB-03] a floor-length hem floats just above the floor and every face points out", () => {
    const o: Outline = { kind: "rect", length: 2.1, width: 0.9 };
    const g = drapeGeometry(o, TOP, TOP - HEM_LIFT);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.y).toBeCloseTo(HEM_LIFT, 3);
    const pos = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    for (let i = 1; i < pos.count; i += 7) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      if (p.y > TOP) expect(n.y).toBeGreaterThan(0.5);
      else if (p.y < TOP - 0.05) expect(n.x * p.x + n.z * p.z).toBeGreaterThan(0);
    }
  });

  test("[LIB-03] a rectangle's corners are crisp at the top and gathered round at the hem", () => {
    const o: Outline = { kind: "rect", length: 2.1, width: 0.9 };
    const pos = drapeGeometry(o, TOP, TOP - HEM_LIFT).getAttribute("position");
    // How far a row's points keep from the square corner of the row's own extent.
    const cornerGap = (y: number) => {
      const row: THREE.Vector2[] = [];
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        if (Math.abs(p.y - y) < 1e-4) row.push(new THREE.Vector2(Math.abs(p.x), Math.abs(p.z)));
      }
      const corner = new THREE.Vector2(Math.max(...row.map((p) => p.x)), Math.max(...row.map((p) => p.y)));
      return Math.min(...row.map((p) => corner.distanceTo(p)));
    };
    expect(cornerGap(TOP - 0.006)).toBeLessThan(0.04);
    expect(cornerGap(HEM_LIFT)).toBeGreaterThan(0.06);
  });

  test("[LIB-03] a lap-length cloth hangs in points at a rectangle's corners, level round a round table", () => {
    const lowest = (o: Outline) => {
      const g = drapeGeometry(o, TOP, LAP_DROP, 64, true);
      g.computeBoundingBox();
      return TOP - (g.boundingBox?.min.y ?? 0);
    };
    const rect: Outline = { kind: "rect", length: 2.1, width: 0.9 };
    // About √2 × the drop (the nearest column to the corner lies a little off it).
    expect(lowest(rect)).toBeGreaterThan(LAP_DROP * 1.33);
    expect(lowest(rect)).toBeLessThanOrEqual(LAP_DROP * Math.SQRT2 + 1e-6);
    expect(lowest({ kind: "round", radius: 0.75 })).toBeCloseTo(LAP_DROP, 3);
    // Mid-edge the hem stays at the lap drop.
    const pos = drapeGeometry(rect, TOP, LAP_DROP, 64, true).getAttribute("position");
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(pos.getX(i)) < 0.5) expect(pos.getY(i)).toBeGreaterThan(TOP - LAP_DROP - 1e-6);
  });

  test("[LIB-03] the hem never reaches further than CLOTH_REACH, and folds deepen toward it", () => {
    for (const o of [
      { kind: "round", radius: 0.75 },
      { kind: "rect", length: 2.8, width: 1.0 },
    ] as Outline[]) {
      const { reach } = hem(drapeGeometry(o, TOP, TOP - HEM_LIFT), o);
      expect(Math.max(...reach)).toBeLessThanOrEqual(CLOTH_REACH + 1e-6);
      expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(0.01);
    }
  });

  test("[LIB-03] [DEC-04] chair-gap rule: tucked chairs of every style stand clear of a floor-length cloth", () => {
    for (const id of ["table-round", "table-rect"])
      for (const seats of [4, 6, 8, 10, 12]) {
        const shape = shapeOf({ id: "t", libraryId: id, x: 0, z: 0, rotY: 0, options: { seats } }, catalog);
        if (shape.kind !== "rectTable" && shape.kind !== "roundTable") throw new Error(id);
        for (const ch of shape.chairs) {
          // Distance from the chair's centre to the table edge, toward the table.
          const edge =
            shape.kind === "roundTable"
              ? Math.hypot(ch.x, ch.z) - shape.diameter / 2
              : Math.max(Math.abs(ch.x) - shape.length / 2, Math.abs(ch.z) - shape.width / 2);
          expect(edge - CHAIR_FRONT_REACH).toBeGreaterThan(CLOTH_REACH);
        }
      }
  });
});
