import { describe, expect, test } from "vitest";
import { bottom, edges, faces } from "../../tools/assets/checks";

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
});
