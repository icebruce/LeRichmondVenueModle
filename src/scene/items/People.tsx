import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { pointInPolygon } from "../../domain/geometry";
import { LOOK_CHOICES, type Look, lookOf, placePeople } from "../../domain/layout/people";
import type { Scenario } from "../../domain/scenario/schema";
import { useEditor, useStudio, useView } from "../context";
import { requestWarmup } from "../frames";
import type { Materials } from "../materials";
import { CONTACT_SMALL, type Contact, ContactShadows } from "./Contact";
import { PeopleLoader } from "./geometry";

/** PPL-01 allows up to 200 guests. */
const MAX = 300;
/** The guests nearest the camera drawn at the finer level, at eye level and in Photo mode (VISUAL_STATUS.md). */
const NEAR = 12;
/** The camera moves this far (m) before the nearest guests are chosen again. */
const RESELECT = 0.25;
/** Levels loaded per device: the finer one for the nearest guests at eye level, the other for the rest. */
const LEVELS: Record<"high" | "low", string[]> = {
  high: ["detail", "medium", "simple"],
  low: ["medium", "simple"],
};
const BODIES = ["man", "woman"] as const;

/** Palettes, one entry per `LOOK_CHOICES` choice: the man's outfits, then the woman's dresses. */
const OUTFITS = [
  ["#3a3d42", "#23304a", "#6b6e72", "#1d1e21", "#5a4a3c"],
  ["#1f2a44", "#5e1f2a", "#1f4a3a", "#1c1c1f", "#b07a7a"],
] as const;
const SKIN = ["#f1d3bd", "#e0b89a", "#c99a7a", "#9c6b4e", "#6b4632"] as const;
const HAIR = ["#1b1512", "#3b2618", "#6b4a2e", "#a88a5e"] as const;
/** Overview figures fade toward this warm white and turn see-through (DESIGN_GUIDE §9). */
const GHOST = { colour: "#ebe4da", mix: 0.35, opacity: 0.55 };

const linear = (hex: string) => new THREE.Color(hex);
const vec3s = (list: readonly string[]) => list.map(linear).map((c) => new THREE.Vector3(c.r, c.g, c.b));

/** The figure mirrored left to right: positions and normals across x, windings reversed. */
function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  for (const name of ["position", "normal"]) {
    const a = m.getAttribute(name) as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
  }
  const idx = m.getIndex();
  if (!idx) throw new Error("people: figures are indexed");
  for (let t = 0; t < idx.count; t += 3) {
    const b = idx.getX(t + 1);
    idx.setX(t + 1, idx.getX(t + 2));
    idx.setX(t + 2, b);
  }
  return m;
}

/**
 * One material for every guest (V7): the vertex colour holds the part in its alpha (outfit, skin,
 * hair, or drawn as is) and the shade in its red (0.5 the part's average); the guest's palette
 * choices come as the batch colour (choice / 16). `ghost` and `opacity` are uniforms, so the
 * overview's see-through figures need no other shader.
 */
function peopleMaterial(ghost: { value: number }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outfits = { value: vec3s(OUTFITS.flat()) };
    shader.uniforms.skins = { value: vec3s(SKIN) };
    shader.uniforms.hairs = { value: vec3s(HAIR) };
    shader.uniforms.ghost = ghost;
    shader.uniforms.ghostColour = { value: linear(GHOST.colour) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 outfits[${OUTFITS.flat().length}];
uniform vec3 skins[${SKIN.length}];
uniform vec3 hairs[${HAIR.length}];
uniform float ghost;
uniform vec3 ghostColour;`,
      )
      .replace(
        "#include <color_vertex>",
        `vec3 choice = floor(getBatchingColor(getIndirectIndex(gl_DrawID)).rgb * 16.0 + 0.5);
int part = int(floor(color.a * 3.0 + 0.5));
vec3 base = part == 0 ? outfits[int(choice.r)] : part == 1 ? skins[int(choice.g)] : hairs[int(choice.b)];
vColor = vec4(mix(part == 3 ? color.rgb : base * color.r * 2.0, ghostColour, ghost * ${GHOST.mix.toFixed(2)}), 1.0);`,
      );
  };
  return mat;
}

type Figures = { mesh: THREE.BatchedMesh; ids: Map<string, number>; ghost: { value: number } };

/** Every figure of the loaded levels, plain and mirrored, in one batched mesh: one draw call for all guests. */
function batch(levels: Map<string, THREE.BufferGeometry>[], names: string[]): Figures {
  const geos = new Map<string, THREE.BufferGeometry>();
  levels.forEach((level, l) => {
    for (const [name, g] of level) {
      geos.set(`${names[l]}:${name}:0`, g);
      geos.set(`${names[l]}:${name}:1`, mirrored(g));
    }
  });
  const sum = (f: (g: THREE.BufferGeometry) => number) => [...geos.values()].reduce((a, g) => a + f(g), 0);
  const ghost = { value: 0 };
  const mesh = new THREE.BatchedMesh(
    MAX,
    sum((g) => g.getAttribute("position").count),
    sum((g) => g.getIndex()?.count ?? 0),
    peopleMaterial(ghost),
  );
  const ids = new Map<string, number>();
  for (const [key, g] of geos) ids.set(key, mesh.addGeometry(g));
  for (const [key, g] of geos) if (key.endsWith(":1")) g.dispose();
  return { mesh, ids, ghost };
}

/**
 * Frees the batch's GPU buffers, textures and shader. `BatchedMesh.dispose` would also drop its data
 * textures, leaving it unusable when React mounts the same memoised mesh again (strict mode).
 */
function release(mesh: THREE.BatchedMesh) {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  for (const v of Object.values(mesh)) if (v instanceof THREE.Texture) v.dispose();
}

/**
 * Guests seated on chairs and standing in open floor (PPL-01..03), drawn as the V7 figures: two
 * bodies in four poses, mirrored, recoloured per guest. Loaded after the room. At eye level and in
 * Photo mode the nearest guests get the finer level; in the overview the figures are light and
 * see-through.
 */
export function People({ low, m, detail }: { low: boolean; m: Materials; detail: boolean }) {
  const names = LEVELS[low ? "low" : "high"];
  const loaded = useLoader(PeopleLoader, names);
  const figures = useMemo(() => batch(loaded, names), [loaded, names]);
  useEffect(() => () => release(figures.mesh), [figures]);
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const show = useView((s) => s.showPeople);
  const drag = useView((s) => s.drag);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => requestWarmup(), [figures]);
  // Recomputed when the layout settles, not on every frame of a drag.
  const crowd = useMemo(
    () =>
      placePeople(
        scenario.items,
        scenario.guests.count,
        scenario.phase ?? "dinner",
        venue,
        catalog,
        scenario.venueToggles,
        scenario.guests.seed,
      ),
    [scenario.items, scenario.guests, scenario.phase, scenario.venueToggles, venue, catalog],
  );
  const level = useMemo(
    () => (x: number, z: number) => (pointInPolygon([x, z], venue.raised.outline) ? venue.raised.height : 0),
    [venue],
  );
  // Everyone in one list, seated first, each with their look and floor height.
  const guests = useMemo(() => {
    const seed = scenario.guests.seed;
    const all = [
      ...crowd.seated.map((p, i) => ({ ...p, look: lookOf(seed, i, true), seated: true })),
      ...crowd.standing.map((p, i) => ({ ...p, look: lookOf(seed, i, false), seated: false })),
    ];
    return all.slice(0, MAX).map((g) => ({ ...g, y: level(g.x, g.z) }));
  }, [crowd, level, scenario.guests.seed]);
  // Standing guests stand on a soft contact shadow; seated ones have their chair's.
  const contacts = useMemo<Contact[]>(
    () => guests.filter((g) => !g.seated).map((g) => ({ ...g, w: CONTACT_SMALL, d: CONTACT_SMALL })),
    [guests],
  );
  // Rank 0: the nearest guests at eye level, 1: the others there, 2: the overview; a phone has no
  // detailed level, so its ranks 1 and 2 share the simple one.
  const geometryOf = useCallback(
    (look: Look, rank: 0 | 1 | 2) =>
      figures.ids.get(
        `${names[Math.min(rank, names.length - 1)]}:${look.body}-${look.pose}:${look.mirror ? 1 : 0}`,
      ) as number,
    [figures, names],
  );
  // The camera position the nearest guests were last chosen from; null: choose again.
  const near = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    const { mesh } = figures;
    const t = new THREE.Object3D();
    const c = new THREE.Color();
    guests.forEach((g, i) => {
      const id = geometryOf(g.look, 2);
      if (i >= mesh.instanceCount) mesh.addInstance(id);
      else mesh.setGeometryIdAt(i, id);
      mesh.setVisibleAt(i, true);
      t.position.set(g.x, g.y, g.z);
      t.rotation.set(0, g.rotY, 0);
      // Standing guests vary a little in height; seated ones keep their fit to the chair and table.
      t.scale.setScalar(g.seated ? 1 : 0.96 + ((i * 37) % 9) * 0.01);
      t.updateMatrix();
      mesh.setMatrixAt(i, t.matrix);
      const body = BODIES.indexOf(g.look.body);
      mesh.setColorAt(
        i,
        c.setRGB(body * LOOK_CHOICES.outfit + g.look.outfit, g.look.skin, g.look.hair).multiplyScalar(1 / 16),
      );
    });
    for (let i = guests.length; i < mesh.instanceCount; i++) mesh.setVisibleAt(i, false);
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = !low;
    near.current = null;
    // Written in place: ask for a frame (frames are on demand).
    invalidate();
  }, [guests, figures, geometryOf, low, invalidate]);
  useEffect(() => {
    figures.ghost.value = detail ? 0 : 1;
    (figures.mesh.material as THREE.Material).opacity = detail ? 1 : GHOST.opacity;
    near.current = null;
    invalidate();
  }, [detail, figures, invalidate]);
  // The nearest guests at the finer level, chosen again once the camera has moved.
  useFrame(({ camera }) => {
    // Not before the guests are placed (effects run after the first frame's hooks may).
    if (figures.mesh.instanceCount < guests.length) return;
    if (near.current && (!detail || near.current.distanceTo(camera.position) < RESELECT)) return;
    near.current = camera.position.clone();
    const p = camera.position;
    const order = guests
      .map((g, i) => ({ i, d: (g.x - p.x) ** 2 + (g.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    const fine = new Set(detail ? order.slice(0, NEAR).map((o) => o.i) : []);
    guests.forEach((g, i) =>
      figures.mesh.setGeometryIdAt(i, geometryOf(g.look, detail ? (fine.has(i) ? 0 : 1) : 2)),
    );
  });
  if (!show || drag) return null;
  return (
    <group name="people">
      <primitive object={figures.mesh} />
      <ContactShadows list={contacts} m={m} />
    </group>
  );
}
