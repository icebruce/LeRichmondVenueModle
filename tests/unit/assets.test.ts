import { describe, expect, test } from "vitest";
import { bottom, edges, faces, figureFit } from "../../tools/assets/checks";

// A unit cube resting on the floor, as a GLB exporter writes it: 24 vertices (split per face for
// normals), 12 triangles wound outward.
function cube() {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const sides: [number[], number[], number[]][] = [
    [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ],
  ];
  for (const [n, u, v] of sides) {
    const base = positions.length / 3;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      for (let k = 0; k < 3; k++)
        positions.push(
          0.5 * ((n[k] as number) + su * (u[k] as number) + sv * (v[k] as number)) + (k === 1 ? 0.5 : 0),
        );
      normals.push(...n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

describe("asset checks", () => {
  test("[LIB-11] a closed cube has no open or non-manifold edges, even split at its seams", () => {
    expect(edges(cube())).toEqual({ open: 0, nonManifold: 0 });
  });

  test("[LIB-11] a missing face shows as open edges", () => {
    const m = cube();
    m.indices.splice(0, 6);
    expect(edges(m).open).toBe(4);
  });

  test("[LIB-11] flipped and zero-area triangles are counted", () => {
    const m = cube();
    expect(faces(m)).toEqual({ zeroArea: 0, flipped: 0 });
    [m.indices[1], m.indices[2]] = [m.indices[2] as number, m.indices[1] as number];
    m.indices.push(0, 0, 1);
    expect(faces(m)).toEqual({ zeroArea: 1, flipped: 1 });
  });

  test("[LIB-11] the lowest point gives floor contact", () => {
    expect(bottom(cube())).toBeCloseTo(0, 6);
  });

  // Guest figures as points (x, y, z): feet, the lowest point over the seat, and the hands.
  const figure = (...points: number[][]) => ({ positions: points.flat(), indices: [] });
  const feet = [0, 0.005, 0.3];

  test("[PPL-01] a seated figure on the seat with its hands on the table top fits", () => {
    expect(figureFit(figure(feet, [0, 0.44, -0.1], [0.1, 0.76, 0.45]), "table")).toEqual([]);
  });

  test("[PPL-01] floating feet, a figure off the seat, hands in the air or through the top are refused", () => {
    expect(figureFit(figure([0, 0.05, 0.3]), "standing")).toEqual(["feet 50 mm off the floor"]);
    const off = figureFit(figure(feet, [0, 0.5, -0.1], [0.1, 0.8, 0.45], [0, 0.73, 0.4]), "table");
    expect(off).toEqual([
      "lowest point over the seat at 500 mm",
      "1 points inside the table top",
      "hands at 730 mm, not on the table top",
    ]);
  });
});
