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
/**
 * Levels by size on screen, in every view (owner, 2026-10-22: a close look in the overview is as
 * smooth as at eye level; its narrow lens makes far guests large): a guest drawn taller than `px[0]`
 * pixels gets the detailed level, taller than `px[1]` medium, the rest and those out of the frame
 * simple, while the triangles over simple stay within the device's `spare` (desktop: drawn again
 * for the shadows; phones: their frame budget; VISUAL_STATUS.md): medium first, nearest first.
 */
const NEAR = { px: [300, 45], spare: { high: 70_000, low: 45_000 } } as const;
/** A guest's height for its size on screen (m): seated, standing about 1.7. */
const TALL = 1.3;
/** The camera moves this far (m), or its lens this much (degrees), before the levels are chosen again. */
const RESELECT = 0.25;
/** The levels, finest first, on every device (owner, 2026-10-22: phones handle the finer guests). */
const LEVELS = ["detail", "medium", "simple"];
const BODIES = ["man", "woman"] as const;
/** The figures' shade and parts textures, shared by every level (`people_pack.py`). */
const TEXTURES = ["shade.webp", "parts.png"].map(
  (f) => `${import.meta.env.BASE_URL}assets/models/people/people-${f}`,
);

/** Palettes, one entry per `LOOK_CHOICES` choice: the man's outfits, then the woman's dresses. */
const OUTFITS = [
  ["#3a3d42", "#23304a", "#6b6e72", "#1d1e21", "#5a4a3c"],
  ["#1f2a44", "#5e1f2a", "#1f4a3a", "#1c1c1f", "#b07a7a"],
] as const;
const SKIN = ["#f1d3bd", "#e0b89a", "#c99a7a", "#9c6b4e", "#6b4632"] as const;
const HAIR = ["#1b1512", "#3b2618", "#6b4a2e", "#a88a5e"] as const;
/**
 * The fabric's rough look (owner, 2026-10-22): a fine grain over each part, as a share of its colour
 * (outfit, skin, hair, as is), at two scales (cycles a metre), fading out where it would shimmer.
 */
const GRAIN = { amount: [0.1, 0.035, 0.14, 0.05], fine: 420, coarse: 140 };
/** Guests fade in when they arrive after the room (s; `--m-slow`, shorter with reduced motion). */
const APPEAR = { normal: 0.36, reduced: 0.15 };

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
 * One material for every guest (V7). Two textures shared by every figure (`people_pack.py`): the
 * parts (outfit, skin and hair weights in red, green and blue; none, drawn as is) and the shade
 * (grey, 0.5 the part's average; the colour itself where drawn as is), so a part's border follows
 * the figure, not its triangles (owner, 2026-10-22). The guest's palette choices come as the batch
 * colour (choice / 16). A fine grain gives the fabric, skin and hair their rough look.
 */
function peopleMaterial(shade: THREE.Texture, parts: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, transparent: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.peopleShade = { value: shade };
    shader.uniforms.peopleParts = { value: parts };
    shader.uniforms.outfits = { value: vec3s(OUTFITS.flat()) };
    shader.uniforms.skins = { value: vec3s(SKIN) };
    shader.uniforms.hairs = { value: vec3s(HAIR) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 outfits[${OUTFITS.flat().length}];
uniform vec3 skins[${SKIN.length}];
uniform vec3 hairs[${HAIR.length}];
varying vec3 vGrain;
varying vec2 vPeopleUv;
varying vec3 vOutfit;
varying vec3 vSkin;
varying vec3 vHair;`,
      )
      .replace(
        "#include <color_vertex>",
        `// The batch colours exist once the first guest is placed; a compile before that draws no one.
#ifdef USE_BATCHING_COLOR
vec3 choice = floor(getBatchingColor(getIndirectIndex(gl_DrawID)).rgb * 16.0 + 0.5);
#else
vec3 choice = vec3(0.0);
#endif
vOutfit = outfits[int(choice.r)];
vSkin = skins[int(choice.g)];
vHair = hairs[int(choice.b)];
vPeopleUv = uv;
vGrain = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D peopleShade;
uniform sampler2D peopleParts;
varying vec3 vGrain;
varying vec2 vPeopleUv;
varying vec3 vOutfit;
varying vec3 vSkin;
varying vec3 vHair;
float grainHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float grainNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(grainHash(i), grainHash(i + vec3(1, 0, 0)), f.x), mix(grainHash(i + vec3(0, 1, 0)), grainHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(grainHash(i + vec3(0, 0, 1)), grainHash(i + vec3(1, 0, 1)), f.x), mix(grainHash(i + vec3(0, 1, 1)), grainHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float grainAt(vec3 p) {
  // Each scale fades out once a pixel spans more than a cycle of it (no shimmer at a distance).
  vec3 a = p * ${GRAIN.fine.toFixed(1)};
  vec3 b = p * ${GRAIN.coarse.toFixed(1)};
  float fa = clamp(1.5 - length(fwidth(a)), 0.0, 1.0);
  float fb = clamp(1.5 - length(fwidth(b)), 0.0, 1.0);
  // Far away (the overview) neither scale shows: no noise is computed at all.
  if (fb == 0.0) return 0.0;
  return (grainNoise(a) - 0.5) * fa * 0.55 + (grainNoise(b) - 0.5) * fb * 0.45;
}`,
      )
      .replace(
        "#include <color_fragment>",
        // Instead of the batch's colour (it holds the palette choices, not a colour).
        `vec3 peopleTone = texture2D(peopleShade, vPeopleUv).rgb;
vec3 peopleW = texture2D(peopleParts, vPeopleUv).rgb;
float peopleMix = min(1.0, peopleW.r + peopleW.g + peopleW.b);
vec3 peopleBase = (peopleW.r * vOutfit + peopleW.g * vSkin + peopleW.b * vHair) / max(peopleMix, 1e-4);
diffuseColor.rgb *= mix(peopleTone, peopleBase * peopleTone.r * 2.0, peopleMix);
float grainAmount = dot(peopleW, vec3(${GRAIN.amount
          .slice(0, 3)
          .map((a) => a.toFixed(3))
          .join(", ")})) + (1.0 - peopleMix) * ${GRAIN.amount[3]?.toFixed(3)};
// Hair's grain runs along its strands (stretched vertically); the rest is even.
diffuseColor.rgb *= 1.0 + 2.0 * grainAmount * grainAt(peopleW.b > 0.5 ? vGrain * vec3(1.0, 0.25, 1.0) : vGrain);`,
      );
  };
  return mat;
}

/** The batched mesh, each figure's geometry id by `level:body-pose:mirrored`, and its triangles by id. */
type Figures = { mesh: THREE.BatchedMesh; ids: Map<string, number>; triangles: Map<number, number> };

/** Every figure of the loaded levels, plain and mirrored, in one batched mesh: one draw call for all guests. */
function batch(
  levels: Map<string, THREE.BufferGeometry>[],
  names: string[],
  textures: THREE.Texture[],
): Figures {
  const [shade, parts] = textures as [THREE.Texture, THREE.Texture];
  // Laid out as glTF lays out its textures (not flipped); the shade is colour, the parts are data.
  shade.flipY = parts.flipY = false;
  shade.colorSpace = THREE.SRGBColorSpace;
  const geos = new Map<string, THREE.BufferGeometry>();
  levels.forEach((level, l) => {
    for (const [name, g] of level) {
      geos.set(`${names[l]}:${name}:0`, g);
      geos.set(`${names[l]}:${name}:1`, mirrored(g));
    }
  });
  const sum = (f: (g: THREE.BufferGeometry) => number) => [...geos.values()].reduce((a, g) => a + f(g), 0);
  const mesh = new THREE.BatchedMesh(
    MAX,
    sum((g) => g.getAttribute("position").count),
    sum((g) => g.getIndex()?.count ?? 0),
    peopleMaterial(shade, parts),
  );
  const ids = new Map<string, number>();
  const triangles = new Map<number, number>();
  for (const [key, g] of geos) {
    const id = mesh.addGeometry(g);
    ids.set(key, id);
    triangles.set(id, (g.getIndex()?.count ?? 0) / 3);
  }
  for (const [key, g] of geos) if (key.endsWith(":1")) g.dispose();
  return { mesh, ids, triangles };
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
 * Guests seated on chairs and standing in open floor (PPL-01..03), drawn as the V7 figures: a man
 * and a woman, seated with hands on the table or standing, mirrored, recoloured per guest. Loaded
 * after the room, they fade in. Solid and coloured in every view (owner, 2026-10-22); the larger a
 * guest on screen, the finer its level.
 */
export function People({ low, m }: { low: boolean; m: Materials }) {
  // The textures load alongside the figures, not after them (the first loader suspends).
  useLoader.preload(THREE.TextureLoader, TEXTURES);
  const loaded = useLoader(PeopleLoader, LEVELS);
  const textures = useLoader(THREE.TextureLoader, TEXTURES);
  const figures = useMemo(() => batch(loaded, LEVELS, textures), [loaded, textures]);
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
  // Rank 0: detailed, 1: medium, 2: simple.
  const geometryOf = useCallback(
    (look: Look, rank: 0 | 1 | 2) =>
      figures.ids.get(`${LEVELS[rank]}:${look.body}-${look.pose}:${look.mirror ? 1 : 0}`) as number,
    [figures],
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
  // How far the fade-in has come (0-1).
  const appear = useRef(0);
  useFrame((_, delta) => {
    if (appear.current >= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    appear.current = Math.min(1, appear.current + delta / (reduced ? APPEAR.reduced : APPEAR.normal));
    (figures.mesh.material as THREE.Material).opacity = appear.current;
    invalidate();
  });
  // Each guest's level by its size on screen, chosen again once the camera has moved.
  const lens = useRef(0);
  useFrame(({ camera, size }) => {
    // Not before the guests are placed (effects run after the first frame's hooks may).
    if (figures.mesh.instanceCount < guests.length) return;
    const fov = (camera as THREE.PerspectiveCamera).fov;
    const still = near.current && near.current.distanceTo(camera.position) < RESELECT;
    if (still && Math.abs(fov - lens.current) < RESELECT) return;
    near.current = camera.position.clone();
    lens.current = fov;
    // Pixels a metre tall at a metre away.
    const scale = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    const p = camera.position;
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const order = guests
      .map((g, i) => ({ i, d: Math.hypot(g.x - p.x, g.y + 1 - p.y, g.z - p.z) }))
      .sort((a, b) => a.d - b.d);
    const triangles = (id: number) => figures.triangles.get(id) as number;
    // The level each guest's size asks for; out of the frame, simple (their shadows show it least).
    const wants = order.map(({ i, d }) => {
      const g = guests[i] as (typeof guests)[number];
      const px = (TALL * scale) / d;
      const seen = frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(g.x, g.y + 0.9, g.z), 1));
      return { i, look: g.look, want: !seen ? 2 : px > NEAR.px[0] ? 0 : px > NEAR.px[1] ? 1 : 2 };
    });
    // Within the spare triangles: first medium for every guest who asks for at least that, then
    // detailed for the nearest who ask for it (a few detailed guests must not leave the rest simple).
    const rank = new Map<number, 0 | 1 | 2>();
    let spare: number = NEAR.spare[low ? "low" : "high"];
    for (const step of [1, 0] as const)
      for (const { i, look, want } of wants) {
        if (want > step) continue;
        const cost = triangles(geometryOf(look, step)) - triangles(geometryOf(look, rank.get(i) ?? 2));
        if (cost > spare) continue;
        spare -= cost;
        rank.set(i, step);
      }
    for (const { i, look } of wants) figures.mesh.setGeometryIdAt(i, geometryOf(look, rank.get(i) ?? 2));
  });
  if (!show || drag) return null;
  return (
    <group name="people">
      <primitive object={figures.mesh} />
      <ContactShadows list={contacts} m={m} />
    </group>
  );
}
