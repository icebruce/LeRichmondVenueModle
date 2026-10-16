import * as THREE from "three";
import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { pointInPolygon } from "../../domain/geometry";
import { useAdvisories, useStudio, useView } from "../context";

/** Amber dashed outline on each advisory's floor area (DESIGN_GUIDE §5); never blocks anything. */
export function Advisories() {
  const { venue } = useStudio();
  const list = useAdvisories();
  const drag = useView((s) => s.drag);
  const amber = useMemo(
    () =>
      (typeof document !== "undefined" &&
        getComputedStyle(document.documentElement).getPropertyValue("--advisory").trim()) ||
      "#b7791f",
    [],
  );
  // Edge pairs of every outline, drawn as one line-segments object (one draw call).
  const segments = useMemo(
    () =>
      list.flatMap((a) => {
        const area = a.area ?? [];
        if (!area.length) return [];
        const c = area.reduce((s, p) => [s[0] + p[0] / area.length, s[1] + p[1] / area.length], [0, 0]);
        const y = (pointInPolygon([c[0], c[1]], venue.raised.outline) ? venue.raised.height : 0) + 0.03;
        return area.flatMap(([x, z], i) => {
          const [nx, nz] = area[(i + 1) % area.length] ?? [x, z];
          return [new THREE.Vector3(x, y, z), new THREE.Vector3(nx, y, nz)];
        });
      }),
    [list, venue],
  );
  if (drag || !segments.length) return null;
  return (
    <group name="advisories">
      <Line
        segments
        points={segments}
        color={amber}
        lineWidth={2.5}
        dashed
        dashSize={0.18}
        gapSize={0.12}
        depthTest={false}
        renderOrder={8}
        transparent
        opacity={0.95}
      />
    </group>
  );
}
