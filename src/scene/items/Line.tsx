import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

type Point = THREE.Vector3 | readonly [number, number, number];

/**
 * A line of constant screen width (outlines, guides, advisories). Unlike drei's Line it keeps its
 * material when its points change, so a drag or a new advisory never recompiles a shader.
 * `segments`: the points are pairs, each drawn as its own segment.
 */
export function Line({
  points,
  segments = false,
  color,
  lineWidth,
  dashed = false,
  dashSize = 1,
  gapSize = 1,
  depthTest = true,
  renderOrder = 0,
  opacity = 1,
  visible = true,
}: {
  points: readonly Point[];
  segments?: boolean;
  color: string;
  lineWidth: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  depthTest?: boolean;
  renderOrder?: number;
  opacity?: number;
  visible?: boolean;
}) {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const [material] = useState(() => new LineMaterial({ transparent: true }));
  const line = useMemo(() => (segments ? new LineSegments2() : new Line2()), [segments]);
  const geometry = useMemo(() => {
    const g = segments ? new LineSegmentsGeometry() : new LineGeometry();
    g.setPositions(points.flatMap((p) => (p instanceof THREE.Vector3 ? [p.x, p.y, p.z] : [...p])));
    return g;
  }, [points, segments]);
  // Changed in place, so each change asks for a frame itself (frames are drawn on demand).
  useLayoutEffect(() => {
    line.geometry = geometry;
    line.computeLineDistances();
    invalidate();
    return () => geometry.dispose();
  }, [line, geometry, invalidate]);
  useLayoutEffect(() => {
    material.color.set(color);
    material.linewidth = lineWidth;
    material.dashed = dashed;
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.depthTest = depthTest;
    material.opacity = opacity;
    material.resolution.set(size.width, size.height);
    invalidate();
  }, [material, color, lineWidth, dashed, dashSize, gapSize, depthTest, opacity, size, invalidate]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <primitive
      object={line}
      material={material}
      renderOrder={renderOrder}
      visible={visible}
      raycast={noHit}
    />
  );
}

/** Lines are drawn over the room and never take a pointer. */
const noHit = () => null;
