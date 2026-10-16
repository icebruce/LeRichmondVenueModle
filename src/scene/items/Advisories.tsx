import * as THREE from "three";
import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { advise } from "../../domain/layout/advisories";
import { pointInPolygon } from "../../domain/geometry";
import type { Scenario } from "../../domain/scenario/schema";
import { useEditor, useStudio, useView } from "../context";

/**
 * Amber dashed outline on each advisory's floor area, with its short label (DESIGN_GUIDE §5);
 * never blocks anything. Live while dragging, so the couple sees an aisle close as they move.
 */
export function Advisories() {
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const drag = useView((s) => s.drag);
  const amber = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--advisory").trim(),
    [],
  );
  const list = useMemo(() => {
    const items = drag
      ? scenario.items.map((it) =>
          drag.ids.includes(it.id)
            ? { ...it, x: it.x + drag.dx, z: it.z + drag.dz, rotY: it.rotY + drag.dRot }
            : it,
        )
      : scenario.items;
    return advise(items, scenario.guests.count, scenario.thresholds, venue, catalog, scenario.venueToggles);
  }, [scenario, drag, venue, catalog]);
  const floorY = (x: number, z: number) =>
    (pointInPolygon([x, z], venue.raised.outline) ? venue.raised.height : 0) + 0.03;
  // Edge pairs of every outline, drawn as one line-segments object (one draw call).
  const segments = useMemo(
    () =>
      list.flatMap((a) => {
        const area = a.area ?? [];
        if (!area.length) return [];
        const c = area.reduce((s, p) => [s[0] + p[0] / area.length, s[1] + p[1] / area.length], [0, 0]);
        const y = floorY(c[0] ?? 0, c[1] ?? 0);
        return area.flatMap(([x, z], i) => {
          const [nx, nz] = area[(i + 1) % area.length] ?? [x, z];
          return [new THREE.Vector3(x, y, z), new THREE.Vector3(nx, y, nz)];
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, venue],
  );
  if (!segments.length) return null;
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
      {list.map(
        (a) =>
          a.label && (
            <Html
              key={a.id}
              center
              position={[a.label.at[0], floorY(a.label.at[0], a.label.at[1]), a.label.at[1]]}
              zIndexRange={[9, 0]}
              className="advisory-label"
            >
              {a.label.text}
            </Html>
          ),
      )}
    </group>
  );
}
