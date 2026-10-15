import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error("merge failed");
  return g;
}

/**
 * Venue oval-back chair (Louis style, R04/R12). Faces +z; the backrest is at -z.
 * Returns the wood frame and the upholstery as separate geometries for two instanced meshes.
 */
export function ovalBackChair(): { frame: THREE.BufferGeometry; fabric: THREE.BufferGeometry } {
  const frame: THREE.BufferGeometry[] = [];
  const fabric: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-0.2, 0.18],
    [0.2, 0.18],
    [-0.19, -0.19],
    [0.19, -0.19],
  ] as const) {
    const leg = new THREE.CylinderGeometry(0.02, 0.014, 0.42, 8);
    leg.translate(x, 0.21, z);
    frame.push(leg);
  }
  frame.push(new THREE.BoxGeometry(0.46, 0.06, 0.42).translate(0, 0.42, 0));
  fabric.push(new THREE.BoxGeometry(0.44, 0.08, 0.4).translate(0, 0.48, 0.01));
  for (const x of [-0.16, 0.16])
    frame.push(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6).translate(x, 0.53, -0.2));
  const oval = new THREE.TorusGeometry(0.19, 0.018, 8, 36);
  oval.scale(1, 1.32, 1);
  oval.rotateX(-0.12);
  oval.translate(0, 0.78, -0.22);
  frame.push(oval);
  const pad = new THREE.CylinderGeometry(0.18, 0.18, 0.045, 32);
  pad.rotateX(Math.PI / 2);
  pad.scale(1, 1.32, 1);
  pad.rotateX(-0.12);
  pad.translate(0, 0.78, -0.21);
  fabric.push(pad);
  return { frame: merge(frame), fabric: merge(fabric) };
}

export function votive(): { glass: THREE.BufferGeometry; flame: THREE.BufferGeometry } {
  const glass = new THREE.CylinderGeometry(0.035, 0.032, 0.075, 16, 1, true).translate(0, 0.0375, 0);
  const flame = new THREE.SphereGeometry(0.012, 8, 6).scale(1, 1.8, 1).translate(0, 0.05, 0);
  return { glass, flame };
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
