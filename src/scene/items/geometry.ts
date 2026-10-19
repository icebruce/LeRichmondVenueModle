import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error("merge failed");
  return g;
}

/**
 * How far any chair style reaches in front of its centre (its seat front, the oval chair's being the
 * deepest), for the chair-gap rule with floor-length cloths (V4).
 */
export const CHAIR_FRONT_REACH = 0.21;

/**
 * Venue oval-back chair (Louis style, R04/R12). Faces +z; the backrest is at -z.
 * Returns the wood frame and the upholstery as separate geometries for two instanced meshes.
 */
export function ovalBackChair(low = false): { frame: THREE.BufferGeometry; fabric: THREE.BufferGeometry } {
  // Phone-weight version (LIB-11): fewer segments on the round parts.
  const seg = low ? 0.5 : 1;
  const frame: THREE.BufferGeometry[] = [];
  const fabric: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.2, 0.18],
    [0.2, 0.18],
    [-0.19, -0.19],
    [0.19, -0.19],
  ] as const) {
    const leg = new THREE.CylinderGeometry(0.02, 0.014, 0.42, low ? 5 : 8);
    leg.translate(x, 0.21, z);
    frame.push(leg);
  }
  frame.push(new THREE.BoxGeometry(0.46, 0.06, 0.42).translate(0, 0.42, 0));
  fabric.push(new THREE.BoxGeometry(0.44, 0.08, 0.4).translate(0, 0.48, 0.01));
  for (const x of [-0.16, 0.16])
    frame.push(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6).translate(x, 0.53, -0.2));
  const oval = new THREE.TorusGeometry(0.19, 0.018, 8 * seg, 36 * seg);
  oval.scale(1, 1.32, 1);
  oval.rotateX(-0.12);
  oval.translate(0, 0.78, -0.22);
  frame.push(oval);
  const pad = new THREE.CylinderGeometry(0.18, 0.18, 0.045, 32 * seg);
  pad.rotateX(Math.PI / 2);
  pad.scale(1, 1.32, 1);
  pad.rotateX(-0.12);
  pad.translate(0, 0.78, -0.21);
  fabric.push(pad);
  return { frame: merge(frame), fabric: merge(fabric) };
}

/** Stretch cover for a cocktail high-top: narrow waist, flared foot (lathe). */
export function cocktailCover(radius: number, height: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.3, 0),
    new THREE.Vector2(0.18, 0.08),
    new THREE.Vector2(0.09, height * 0.45),
    new THREE.Vector2(radius * 0.92, height - 0.03),
    new THREE.Vector2(radius, height),
    new THREE.Vector2(0, height),
  ];
  return new THREE.LatheGeometry(pts, 40);
}

/** Wood cross-back chair with a rush seat. Faces +z; frame and seat as two geometries. */
export function crossbackChair(low = false): { frame: THREE.BufferGeometry; fabric: THREE.BufferGeometry } {
  const frame: THREE.BufferGeometry[] = [];
  for (const [x, z, h] of [
    [-0.19, 0.18, 0.45],
    [0.19, 0.18, 0.45],
    [-0.19, -0.18, 0.92],
    [0.19, -0.18, 0.92],
  ] as const)
    frame.push(new THREE.BoxGeometry(0.035, h, 0.035).translate(x, h / 2, z));
  frame.push(new THREE.BoxGeometry(0.42, 0.05, 0.03).translate(0, 0.9, -0.18));
  frame.push(new THREE.BoxGeometry(0.42, 0.03, 0.03).translate(0, 0.5, -0.18));
  for (const s of [-1, 1]) {
    const bar = new THREE.BoxGeometry(0.025, 0.46, 0.02);
    bar.rotateZ(s * 0.72);
    bar.translate(0, 0.7, -0.18);
    frame.push(bar);
  }
  for (const z of [0.18, -0.18]) frame.push(new THREE.BoxGeometry(0.38, 0.02, 0.02).translate(0, 0.15, z));
  const seat = new THREE.BoxGeometry(0.42, 0.05, 0.4, low ? 1 : 4, 1, low ? 1 : 4).translate(0, 0.46, 0);
  return { frame: merge(frame), fabric: seat.toNonIndexed() };
}

/** Chiavari chair: thin tapered legs with rungs, spindle back, cushion. Faces +z. */
export function chiavariChair(low = false): { frame: THREE.BufferGeometry; fabric: THREE.BufferGeometry } {
  const seg = low ? 5 : 8;
  const frame: THREE.BufferGeometry[] = [];
  for (const [x, z, h] of [
    [-0.19, 0.17, 0.44],
    [0.19, 0.17, 0.44],
    [-0.18, -0.17, 0.92],
    [0.18, -0.17, 0.92],
  ] as const)
    frame.push(new THREE.CylinderGeometry(0.014, 0.011, h, seg).translate(x, h / 2, z));
  for (const y of [0.18, 0.3]) {
    frame.push(
      new THREE.CylinderGeometry(0.008, 0.008, 0.38, seg).rotateZ(Math.PI / 2).translate(0, y, 0.17),
    );
    frame.push(
      new THREE.CylinderGeometry(0.008, 0.008, 0.36, seg).rotateZ(Math.PI / 2).translate(0, y, -0.17),
    );
  }
  frame.push(new THREE.BoxGeometry(0.42, 0.03, 0.4).translate(0, 0.43, 0));
  for (const y of [0.62, 0.76, 0.9])
    frame.push(new THREE.CylinderGeometry(0.01, 0.01, 0.36, seg).rotateZ(Math.PI / 2).translate(0, y, -0.17));
  for (const x of [-0.09, 0, 0.09])
    frame.push(new THREE.CylinderGeometry(0.007, 0.007, 0.42, seg).translate(x, 0.69, -0.17));
  const cushion = new THREE.BoxGeometry(0.4, 0.05, 0.38).translate(0, 0.47, 0.005);
  return { frame: merge(frame), fabric: cushion.toNonIndexed() };
}

/** Chair geometry by library `params.style` (DEC-04, LIB-02). */
export function chairGeometry(style: string, low: boolean) {
  if (style === "crossback") return crossbackChair(low);
  if (style === "chiavari") return chiavariChair(low);
  return ovalBackChair(low);
}
