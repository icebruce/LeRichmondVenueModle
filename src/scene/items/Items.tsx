import * as THREE from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  type Item,
  type Shape,
  blocksFloor,
  chairsWorld,
  footprint,
  localFootprint,
  shapeOf,
} from "../../domain/layout/items";
import { bottomOf } from "../../domain/layout/decor";
import { alignSnap } from "../../domain/layout/align";
import { checkPlacement, levelHeight, spotFor, toggledObstacles } from "../../domain/layout/validate";
import { tableLabels } from "../../domain/layout/counts";
import { type Polygon, centredRect, circle, snap } from "../../domain/geometry";
import { type Catalog, hangingLight } from "../../domain/library/catalog";
import type { Scenario } from "../../domain/scenario/schema";
import { styleOf } from "../../domain/scenario/scenario";
import { GRID, ROTATE_STEP } from "../../state/editor";
import { type Drag, viewStore } from "../../state/view";
import { useEditor, useStudio, useView } from "../context";
import type { Materials } from "../materials";
import type { Quality } from "../quality";
import { type Placed, LIFT, TOP, moved } from "./common";
import { Chairs, PieceModels, TableDecor, useDecorParts } from "./Decor";
import { TableContacts } from "./Contact";
import { type PieceImage, type PieceText, makePiece } from "../../domain/layout/pieces";
import { cocktailCover } from "./geometry";
import { sharedDrape } from "./drape";
import { clothDrop } from "../../domain/layout/cloth";
import { Line } from "./Line";

/** The item an intersected mesh belongs to (its `item-<id>` group), if any. */
function itemIdOf(o: THREE.Object3D | null): string | null {
  for (; o; o = o.parent) if (o.name.startsWith("item-")) return o.name.slice(5);
  return null;
}

const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/** Colours come from the design tokens (tokens.css), so the 3D outline matches the interface. */
function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Cloth colour from the linen's library entry; null for bare wood (DEC-01). */
function linenColour(catalog: Catalog, id: string): string | null {
  const model = catalog.get(id)?.model;
  if (model?.kind !== "parametric" || model.params.bare === true) return null;
  const c = model.params.colour;
  return typeof c === "string" ? c : "#f2efe6";
}

function usePlaced(scenario: Scenario): Placed[] {
  const { venue, catalog } = useStudio();
  // A light whose height grip is held is drawn at the height under the pointer.
  const lift = useView((s) => s.lift);
  return useMemo(() => {
    const extra = toggledObstacles(venue, scenario.venueToggles);
    return scenario.items.map((saved) => {
      const item =
        lift?.id === saved.id ? { ...saved, options: { ...saved.options, hang: lift.hang } } : saved;
      const r = checkPlacement(item, scenario.items, venue, catalog, extra);
      const level = r.ok ? r.level : (spotFor(item, venue)?.level ?? "main");
      return { item, shape: shapeOf(item, catalog), y: levelHeight(level, venue), ok: r.ok };
    });
  }, [scenario.items, scenario.venueToggles, venue, catalog, lift]);
}

function Legs({ pts, m }: { pts: [number, number][]; m: Materials }) {
  return (
    <>
      {pts.map(([x, z], i) => (
        <mesh key={i} position={[x, (TOP - 0.03) / 2, z]} material={m.blackMetal} castShadow>
          <cylinderGeometry args={[0.025, 0.025, TOP - 0.03, 8]} />
        </mesh>
      ))}
    </>
  );
}

function TableBody({
  shape,
  linen,
  lap,
  m,
  segments,
  evening,
}: {
  shape: Shape;
  linen: THREE.Material | null;
  lap: boolean;
  m: Materials;
  segments: number;
  evening: boolean;
}) {
  // Floor length stops just above the floor; lap length stops LAP_DROP below the top, a rectangle's
  // corners in points, and shows the legs. The drape's top lies on the table top, under the décor (LIB-03).
  const drape = (outline: Parameters<typeof sharedDrape>[0], cloth: THREE.Material) => (
    <mesh
      geometry={sharedDrape(outline, TOP - 0.003, clothDrop(lap) - 0.003, segments, lap)}
      material={cloth}
      castShadow
      receiveShadow
    />
  );
  if (shape.kind === "rectTable") {
    if (shape.farm || !linen) {
      const legs = [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => [sx * (shape.length / 2 - 0.12), sz * (shape.width / 2 - 0.1)] as const),
      );
      return (
        <group>
          <mesh position={[0, 0.735, 0]} material={m.timber} castShadow receiveShadow>
            <boxGeometry args={[shape.length, 0.05, shape.width]} />
          </mesh>
          {legs.map(([x, z], i) => (
            <mesh key={i} position={[x, 0.355, z]} material={m.timber} castShadow>
              <boxGeometry args={[0.08, 0.71, 0.08]} />
            </mesh>
          ))}
        </group>
      );
    }
    const lx = shape.length / 2 - 0.1;
    const lz = shape.width / 2 - 0.1;
    return (
      <group>
        {drape({ kind: "rect", length: shape.length, width: shape.width }, linen)}
        {lap && (
          <Legs
            pts={[
              [-lx, -lz],
              [lx, -lz],
              [-lx, lz],
              [lx, lz],
            ]}
            m={m}
          />
        )}
      </group>
    );
  }
  if (shape.kind === "roundTable") {
    const r = shape.diameter / 2;
    if (!linen)
      return (
        <group>
          <mesh position={[0, TOP - 0.025, 0]} material={m.timber} castShadow receiveShadow>
            <cylinderGeometry args={[r, r, 0.05, segments]} />
          </mesh>
          <mesh position={[0, (TOP - 0.05) / 2, 0]} material={m.blackMetal} castShadow>
            <cylinderGeometry args={[0.05, 0.05, TOP - 0.05, 8]} />
          </mesh>
        </group>
      );
    return (
      <group>
        {drape({ kind: "round", radius: r }, linen)}
        {lap && (
          <mesh position={[0, (TOP - 0.03) / 2, 0]} material={m.blackMetal} castShadow>
            <cylinderGeometry args={[0.05, 0.05, TOP - 0.03, 8]} />
          </mesh>
        )}
      </group>
    );
  }
  if (shape.kind === "cocktail") {
    return (
      <mesh
        geometry={cocktailCover(shape.diameter / 2, shape.height)}
        material={linen ?? m.blackMetal}
        castShadow
      />
    );
  }
  if (shape.kind === "danceFloor") return <DanceArea width={shape.width} depth={shape.depth} m={m} />;
  if (shape.kind === "backdrop") return <Backdrop shape={shape} m={m} />;
  if (shape.kind === "piece") return <PieceBody shape={shape} evening={evening} />;
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={djFront(shape.front, m, evening, shape.width)} castShadow>
        <boxGeometry args={[shape.width, 1.0, shape.depth]} />
      </mesh>
      <mesh position={[0, 1.02, -0.05]} material={m.blackMetal}>
        <boxGeometry args={[shape.width * 0.8, 0.05, shape.depth * 0.6]} />
      </mesh>
      <mesh position={[0, 0.5, shape.depth / 2 + 0.005]} material={m.brass}>
        <boxGeometry args={[shape.width, 0.04, 0.01]} />
      </mesh>
    </group>
  );
}

/** The item's own top edge and height, where the selection outline is drawn. */
function topOf(shape: Shape): { poly: Polygon; y: number } {
  switch (shape.kind) {
    case "rectTable":
      return { poly: centredRect(shape.length + 0.06, shape.width + 0.06), y: TOP + 0.01 };
    case "roundTable":
      return { poly: circle(shape.diameter / 2 + 0.03, 40), y: TOP + 0.01 };
    case "cocktail":
      return { poly: circle(shape.diameter / 2, 24), y: shape.height + 0.01 };
    case "danceFloor":
      return { poly: centredRect(shape.width, shape.depth), y: 0.02 };
    case "djBooth":
      return { poly: centredRect(shape.width, shape.depth), y: 1.06 };
    case "backdrop":
      return { poly: centredRect(shape.width, 0.12), y: shape.height + 0.02 };
    case "piece":
      return { poly: centredRect(shape.width, shape.depth), y: shape.height + 0.02 };
  }
}

/** The dance area (LIB-01): a thin line and a faint tint on the floor; no floor is laid. */
function DanceArea({ width, depth, m }: { width: number; depth: number; m: Materials }) {
  const frame = useMemo(() => {
    const [w, d, line] = [width / 2, depth / 2, 0.08];
    const outline = new THREE.Shape([
      new THREE.Vector2(-w, -d),
      new THREE.Vector2(w, -d),
      new THREE.Vector2(w, d),
      new THREE.Vector2(-w, d),
    ]);
    outline.holes.push(
      new THREE.Path([
        new THREE.Vector2(-w + line, -d + line),
        new THREE.Vector2(-w + line, d - line),
        new THREE.Vector2(w - line, d - line),
        new THREE.Vector2(w - line, -d + line),
      ]),
    );
    return new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2);
  }, [width, depth]);
  useEffect(() => () => frame.dispose(), [frame]);
  return (
    <group>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.danceTint}>
        <planeGeometry args={[width, depth]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} geometry={frame} material={m.danceLine} />
    </group>
  );
}

/** LED tiles (LIB-10, DJ booth front): a grid of lit 60 cm squares, glowing in the evening. Shared per size. */
const led = new Map<string, THREE.MeshStandardMaterial>();
function ledTiles(evening: boolean, width: number, depth: number): THREE.MeshStandardMaterial {
  const key = `${evening}|${width}|${depth}`;
  let mat = led.get(key);
  if (!mat) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#101014";
    g.fillRect(0, 0, 256, 256);
    // 4 × 4 tiles of soft light per texture repeat, in a cool white.
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const grd = g.createRadialGradient(32 + i * 64, 32 + j * 64, 4, 32 + i * 64, 32 + j * 64, 30);
        grd.addColorStop(0, "#ffffff");
        grd.addColorStop(1, "#7c7f9a");
        g.fillStyle = grd;
        g.fillRect(i * 64 + 3, j * 64 + 3, 58, 58);
      }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    // The texture holds 4 × 4 tiles of 60 cm, so the tiles keep their size on any floor.
    map.repeat.set(width / 2.4, depth / 2.4);
    mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: "#ffffff",
      emissiveIntensity: evening ? 1.2 : 0.1,
      roughness: 0.2,
    });
    led.set(key, mat);
  }
  return mat;
}

/** DJ booth front (LIB-10): black, white, mirror or lit LED. */
const fronts = new Map<string, THREE.Material>();
function djFront(front: string, m: Materials, evening: boolean, width: number): THREE.Material {
  if (front === "black") return m.djFacade;
  if (front === "led") return ledTiles(evening, width, 1);
  let mat = fronts.get(front);
  if (!mat) {
    mat =
      front === "mirror"
        ? new THREE.MeshStandardMaterial({ color: "#d9dcdf", metalness: 1, roughness: 0.08 })
        : new THREE.MeshStandardMaterial({ color: "#f4f2ee", roughness: 0.35 });
    fronts.set(front, mat);
  }
  return mat;
}

/**
 * A library piece's own body (its parts are drawn with the table décor, instanced): an invisible
 * box to pick it up by, and its words when it has some (neon, sign boards, a projected monogram).
 */
function PieceBody({ shape, evening }: { shape: Extract<Shape, { kind: "piece" }>; evening: boolean }) {
  const piece = makePiece(shape.generator, shape.params, shape.options, shape.size);
  // A hung piece is picked by its body (from 30 cm under where it hangs), not the air beneath it.
  const hang = shape.options.hang;
  const hitH = shape.blocks || typeof hang !== "number" ? shape.height : shape.height - hang + 0.3;
  return (
    <group>
      <mesh position={[0, shape.height - hitH / 2, 0]}>
        <boxGeometry args={[shape.width, hitH, shape.depth]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {piece.text && <PieceWords text={piece.text} evening={evening} />}
      {piece.image && <PiecePhoto image={piece.image} />}
    </group>
  );
}

/** Photos load once per page and are shared by every piece that shows them. */
const photos = new Map<string, Promise<THREE.Texture | null>>();

/**
 * The couple's photo on a piece (LIB-09 print, IMP-05 photo preview), double-sided so a preview
 * reads from behind too. A neutral panel shows until the photo arrives (or if it never does).
 */
function PiecePhoto({ image }: { image: PieceImage }) {
  const { imageUrl } = useStudio();
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!image.id || !imageUrl) return;
    let live = true;
    let p = photos.get(image.id);
    if (!p) {
      p = imageUrl(image.id).then((url) =>
        url
          ? new THREE.TextureLoader().loadAsync(url).then((t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              return t;
            })
          : null,
      );
      // A failed load is not remembered, so the photo is asked for again next time.
      p.then(
        (t) => t ?? photos.delete(image.id),
        () => photos.delete(image.id),
      );
      photos.set(image.id, p);
    }
    p.then((t) => live && setTexture(t)).catch(() => {});
    return () => {
      live = false;
    };
  }, [image.id, imageUrl]);
  return (
    <mesh position={[image.x, image.y, image.z]} rotation={[image.tilt, 0, 0]}>
      <planeGeometry args={[image.w, image.h]} />
      <meshStandardMaterial
        map={texture}
        color={texture ? "#ffffff" : "#d9d3c7"}
        roughness={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Words drawn on a canvas texture (LIB-08 monogram, LIB-09 neon and signs). */
function PieceWords({ text, evening }: { text: PieceText; evening: boolean }) {
  const texture = useMemo(() => wordsTexture(text), [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  const glow = text.look !== "board";
  return (
    <mesh position={[text.x, text.y, text.z]} rotation={[text.tilt, 0, 0]} renderOrder={glow ? 7 : 0}>
      <planeGeometry args={[text.w, text.h]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={!glow}
        toneMapped={!glow}
        blending={glow ? THREE.AdditiveBlending : THREE.NormalBlending}
        // A projection is light: faint in daylight, bright in the evening.
        opacity={text.look === "projection" && !evening ? 0.25 : 1}
      />
    </mesh>
  );
}

function wordsTexture(text: PieceText): THREE.CanvasTexture {
  const W = 1024;
  const H = Math.round((W * text.h) / text.w);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const script = '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive';
  const serif = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';
  const face = text.look === "board" ? serif : script;
  const weight = text.look === "board" ? "500" : "700";
  let size = H * (text.look === "board" ? 0.22 : 0.5);
  g.font = `${weight} ${size}px ${face}`;
  while (g.measureText(text.value).width > W * 0.88 && size > 12) {
    size *= 0.92;
    g.font = `${weight} ${size}px ${face}`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (text.look === "board") {
    g.fillStyle = text.colour;
    g.fillText(text.value, W / 2, H / 2);
  } else {
    // Neon and projected light: a wide halo in the tube's colour, then a lit core that keeps
    // its colour (lightened), so blush stays blush rather than turning white.
    const core = `color-mix(in srgb, ${text.colour} 55%, white)`;
    g.lineJoin = "round";
    g.shadowColor = text.colour;
    for (const blur of [size * 0.6, size * 0.3]) {
      g.shadowBlur = blur;
      g.strokeStyle = text.colour;
      g.lineWidth = size * 0.08;
      g.strokeText(text.value, W / 2, H / 2);
    }
    g.shadowBlur = size * 0.1;
    g.fillStyle = CSS.supports?.("color", core) ? core : text.colour;
    g.fillText(text.value, W / 2, H / 2);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Drapery backdrop (LIB-03): a black frame with one folded sheet of fabric, drawn as a single
 * wavy plane so it costs one draw call however wide it is.
 */
function Backdrop({ shape, m }: { shape: Extract<Shape, { kind: "backdrop" }>; m: Materials }) {
  const { width: w, height: h, colour } = shape;
  const cloth = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h - 0.06, Math.round(w * 24), 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.28) * Math.PI) * 0.035);
    g.computeVertexNormals();
    return g;
  }, [w, h]);
  const fabric = useMemo(
    () => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, side: THREE.DoubleSide }),
    [colour],
  );
  useEffect(
    () => () => {
      cloth.dispose();
      fabric.dispose();
    },
    [cloth, fabric],
  );
  return (
    <group>
      <mesh geometry={cloth} material={fabric} position={[0, (h - 0.06) / 2, 0]} castShadow receiveShadow />
      <mesh position={[0, h - 0.02, 0]} material={m.blackMetal}>
        <boxGeometry args={[w + 0.06, 0.04, 0.04]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w + 0.02)) / 2, h / 2, 0]} material={m.blackMetal}>
          <boxGeometry args={[0.03, h, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

type Tone = "selected" | "hover" | "refused" | "ghost";

/**
 * Selection drawn on the item: its top edge in the accent colour, plus a soft fill over the floor
 * area it claims with its chairs (DESIGN_GUIDE §5). Refused moves use the blocked colour.
 */
export function Outline({ shape, tone, dark }: { shape: Shape; tone: Tone; dark: boolean }) {
  // On the candlelit scene the accent is too dim to read; use its light variant there.
  const colours = useMemo(
    () => ({
      accent: dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b"),
      blocked: token("--blocked", "#c2412d"),
    }),
    [dark],
  );
  const colour = tone === "refused" ? colours.blocked : colours.accent;
  const { top, floor, fill } = useMemo(() => {
    const t = topOf(shape);
    const fp = localFootprint(shape);
    const ring = (poly: Polygon, y: number) =>
      [...poly, poly[0] as [number, number]].map(([x, z]) => new THREE.Vector3(x, y, z));
    const s = new THREE.Shape(fp.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.012, 0);
    return { top: ring(t.poly, t.y), floor: ring(fp, 0.014), fill: g };
  }, [shape]);
  useEffect(() => () => fill.dispose(), [fill]);
  const strong = tone === "selected" || tone === "refused";
  return (
    <group>
      {tone !== "ghost" && (
        <Line
          points={top}
          color={colour}
          lineWidth={strong ? 4 : 2}
          depthTest={false}
          renderOrder={11}
          opacity={strong ? 1 : 0.7}
        />
      )}
      <Line
        points={floor}
        color={colour}
        lineWidth={tone === "ghost" ? 1.5 : 2}
        dashed={tone === "ghost"}
        dashSize={0.15}
        gapSize={0.1}
        depthTest={false}
        renderOrder={10}
        opacity={tone === "hover" ? 0.5 : 0.9}
      />
      {tone !== "ghost" && tone !== "refused" && (
        <mesh geometry={fill} renderOrder={9}>
          <meshBasicMaterial color={colour} transparent opacity={strong ? 0.22 : 0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Alignment guides (LAY-05): a thin line across the room through the shared centre line. */
function Guides({ drag, y, dark }: { drag: Drag; y: number; dark: boolean }) {
  const { venue } = useStudio();
  const accent = useMemo(
    () => (dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b")),
    [dark],
  );
  return (
    <>
      {drag.guides.map((g, i) => (
        <Line
          key={i}
          points={
            g.axis === "x"
              ? [new THREE.Vector3(g.value, y + 0.02, 0), new THREE.Vector3(g.value, y + 0.02, venue.depth)]
              : [new THREE.Vector3(0, y + 0.02, g.value), new THREE.Vector3(venue.width, y + 0.02, g.value)]
          }
          color={accent}
          lineWidth={1.25}
          dashed
          dashSize={0.2}
          gapSize={0.12}
          depthTest={false}
          renderOrder={12}
          opacity={0.85}
        />
      ))}
    </>
  );
}

/**
 * The point under the pointer on the level plane at height `at` (m), or on a given plane (a light's
 * upright drag plane), or null when the ray misses it.
 */
export function useFloorPointer() {
  const { camera, gl, raycaster } = useThree();
  return useCallback(
    (clientX: number, clientY: number, at: number | THREE.Plane): THREE.Vector3 | null => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      const plane = typeof at === "number" ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -at) : at;
      return raycaster.ray.intersectPlane(plane, hit);
    },
    [camera, gl, raycaster],
  );
}

export function Items({
  m,
  evening,
  quality = "high",
  detail = false,
}: {
  m: Materials;
  evening: boolean;
  quality?: Quality;
  /** At eye level: the table décor's detailed blooms (V5). */
  detail?: boolean;
}) {
  const { venue, catalog, editor, readOnly } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const selection = useEditor((s) => s.selection);
  const camera = useEditor((s) => s.camera);
  const drag = useView((s) => s.drag);
  const hover = useView((s) => s.hover);
  const placed = usePlaced(scenario);
  const decor = useDecorParts(placed, scenario, quality === "low");
  const blocking = useMemo(
    () => new Set(placed.filter((p) => blocksFloor(p.shape)).map((p) => p.item.id)),
    [placed],
  );
  const labels = useMemo(() => tableLabels(scenario.items, catalog), [scenario.items, catalog]);
  const toPlane = useFloorPointer();
  const getThree = useThree((s) => s.get);
  const press = useRef<{ x: number; y: number; timer: number | null; started: boolean } | null>(null);

  const lap = scenario.style.linenLength === "lap";
  // One cloth material per linen in use (DEC-01: a table may override the scenario's linen).
  const linenIds = useMemo(
    () => [...new Set(scenario.items.map((it) => styleOf(it, scenario.style).linen))].sort().join("|"),
    [scenario.items, scenario.style],
  );
  const linens = useMemo(() => {
    const map = new Map<string, THREE.Material | null>();
    for (const id of linenIds.split("|")) {
      const colour = linenColour(catalog, id);
      map.set(
        id,
        colour
          ? new THREE.MeshPhysicalMaterial({
              color: colour,
              roughness: 0.82,
              sheen: 0.5,
              sheenColor: new THREE.Color("#ffffff"),
            })
          : null,
      );
    }
    return map;
  }, [linenIds, catalog]);
  useEffect(
    () => () => {
      for (const mat of linens.values()) mat?.dispose();
    },
    [linens],
  );

  function setControls(enabled: boolean) {
    const controls = getThree().controls as { enabled?: boolean } | null;
    if (controls) controls.enabled = enabled;
    viewStore.setState({ controlsEnabled: enabled });
  }

  function beginDrag(
    kind: "move" | "rotate",
    ids: string[],
    e: ThreeEvent<PointerEvent>,
    y: number,
    pivot: [number, number],
  ) {
    const start = toPlane(e.clientX, e.clientY, y);
    if (!start) return;
    // Stop the camera controls from also handling this gesture (they listen on the same canvas).
    setControls(false);
    const pointerId = e.pointerId;
    const base = scenario.items.filter((i) => ids.includes(i.id));
    const others = scenario.items.filter((i) => !ids.includes(i.id));
    const a0 = Math.atan2(start.z - pivot[1], start.x - pivot[0]);
    const extra = toggledObstacles(venue, scenario.venueToggles);
    viewStore.setState({
      drag: { kind, ids, dx: 0, dz: 0, dRot: 0, valid: true, reason: null, guides: [] },
    });
    const snapping = editor.store.getState().snapping;
    // Phone: a second finger during a drag twists the item about its centre (DESIGN_GUIDE §3.2).
    const fingers = new Map<number, [number, number]>([[pointerId, [e.clientX, e.clientY]]]);
    let twist: { id: number; a0: number; dx: number; dz: number } | null = null;
    const fingerAngle = (t: { id: number }) => {
      const p = fingers.get(pointerId);
      const q = fingers.get(t.id);
      return p && q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
    };
    const publish = (dx: number, dz: number, dRot: number, guides: Drag["guides"]) => {
      const next = base.map((b) => ({ ...b, x: b.x + dx, z: b.z + dz, rotY: b.rotY + dRot }));
      const all = [...others, ...next];
      const check = next
        .map((it) => checkPlacement(it, all, venue, catalog, extra, labels))
        .find((r) => !r.ok);
      viewStore.setState({
        drag: {
          kind: twist ? "move" : kind,
          ids,
          dx,
          dz,
          dRot,
          valid: !check,
          reason: check && !check.ok ? check.reason : null,
          guides,
        },
      });
    };
    const move = (ev: PointerEvent) => {
      if (fingers.has(ev.pointerId)) fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (twist) {
        let dRot = -(fingerAngle(twist) - twist.a0);
        if (!ev.altKey) dRot = Math.round(dRot / ROTATE_STEP) * ROTATE_STEP;
        publish(twist.dx, twist.dz, dRot, []);
        return;
      }
      if (ev.pointerId !== pointerId) return;
      const p = toPlane(ev.clientX, ev.clientY, y);
      if (!p) return;
      let dx = 0;
      let dz = 0;
      let dRot = 0;
      let guides: Drag["guides"] = [];
      if (kind === "move") {
        const lead = base[0] as Item;
        const free = !snapping || ev.altKey;
        let x = lead.x + p.x - start.x;
        let z = lead.z + p.z - start.z;
        if (!free) {
          x = snap(x, GRID);
          z = snap(z, GRID);
          // Lining up with a nearby table wins over the grid on that axis (LAY-05).
          const a = alignSnap({ x: lead.x + p.x - start.x, z: lead.z + p.z - start.z }, others, catalog);
          if (a.guides.some((g) => g.axis === "x")) x = a.x;
          if (a.guides.some((g) => g.axis === "z")) z = a.z;
          guides = a.guides;
        }
        dx = x - lead.x;
        dz = z - lead.z;
      } else {
        const a = Math.atan2(p.z - pivot[1], p.x - pivot[0]);
        dRot = -(a - a0);
        if (!ev.altKey) dRot = Math.round(dRot / ROTATE_STEP) * ROTATE_STEP;
      }
      publish(dx, dz, dRot, guides);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointerdown", second);
      setControls(true);
    };
    const up = (ev: PointerEvent) => {
      if (!fingers.has(ev.pointerId)) return;
      stop();
      const d = viewStore.getState().drag;
      viewStore.setState({ drag: null });
      if (!d) return;
      const moved = Math.abs(d.dx) > 1e-3 || Math.abs(d.dz) > 1e-3;
      const turned = Math.abs(d.dRot) > 1e-3;
      if (d.kind === "move" && (moved || turned)) {
        editor.moveItems(
          base.map((b) => ({ id: b.id, x: b.x + d.dx, z: b.z + d.dz, rotY: b.rotY + d.dRot })),
        );
      } else if (d.kind === "rotate" && turned) {
        editor.rotateItems(ids, d.dRot);
      }
    };
    // The system took the pointer: drop the drag, move nothing.
    const cancel = (ev: PointerEvent) => {
      if (!fingers.has(ev.pointerId)) return;
      stop();
      viewStore.setState({ drag: null });
    };
    const second = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) return;
      if (kind === "move" && ev.pointerType === "touch" && !twist) {
        fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
        const d = viewStore.getState().drag;
        twist = { id: ev.pointerId, a0: 0, dx: d?.dx ?? 0, dz: d?.dz ?? 0 };
        twist.a0 = fingerAngle(twist);
        return;
      }
      // Any other extra pointer (a third finger, a mouse click) ends the gesture without a change.
      stop();
      viewStore.setState({ drag: null });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerdown", second);
  }

  function onDown(e: ThreeEvent<PointerEvent>, p: Placed) {
    if (readOnly || camera === "walk" || e.button > 0 || onGrip(e)) return;
    const id = p.item.id;
    const current = editor.store.getState().selection;
    // A hanging or projected piece over a table gives way to the table (from above it covers it),
    // so pressing there selects and drags the table. A plain click on the already selected table
    // (no movement) then selects the piece.
    if (!blocksFloor(p.shape)) {
      const under = e.intersections
        .map((i) => itemIdOf(i.object))
        .find((other) => other && other !== id && blocking.has(other));
      if (under && !current.includes(id)) {
        if (current.includes(under)) {
          const [x0, y0] = [e.clientX, e.clientY];
          const up = (ev: PointerEvent) => {
            if (ev.pointerId !== e.pointerId) return;
            window.removeEventListener("pointerup", up);
            // After the table's own release has run, so its drag (if any) ends first.
            if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4)
              window.setTimeout(() => editor.select([id]));
          };
          window.addEventListener("pointerup", up);
        }
        return;
      }
    }
    e.stopPropagation();
    const ids = e.shiftKey
      ? current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id]
      : current.includes(id)
        ? current
        : [id];
    editor.select(ids);
    if (spotFor(p.item, venue)?.level === "mezzanine") return;
    const pivot: [number, number] = [p.item.x, p.item.z];
    if (e.pointerType === "touch") {
      // Long-press to pick up on touch, so one-finger drags still orbit the camera (DESIGN_GUIDE §3.2).
      const pointerId = e.pointerId;
      const clear = () => {
        window.removeEventListener("pointermove", moveOff);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (press.current?.timer) window.clearTimeout(press.current.timer);
        press.current = null;
      };
      const moveOff = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || !press.current || press.current.started) return;
        if (Math.hypot(ev.clientX - press.current.x, ev.clientY - press.current.y) > 8) clear();
      };
      const end = (ev: PointerEvent) => ev.pointerId === pointerId && clear();
      const timer = window.setTimeout(() => {
        if (press.current && !press.current.started) {
          press.current.started = true;
          navigator.vibrate?.(10);
          beginDrag("move", ids, e, p.y, pivot);
        }
      }, 300);
      press.current = { x: e.clientX, y: e.clientY, timer, started: false };
      window.addEventListener("pointermove", moveOff);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      return;
    }
    beginDrag("move", ids, e, p.y, pivot);
  }

  const single = selection.length === 1 ? placed.find((p) => p.item.id === selection[0]) : undefined;
  const showLabels = camera === "plan";
  const segments = quality === "low" ? 24 : 48;

  return (
    <group name="items">
      {placed.map((p) => {
        const d = drag?.ids.includes(p.item.id) ? drag : null;
        const item = moved(p.item, d);
        const selected = selection.includes(p.item.id);
        const tone: Tone | null =
          d && !d.valid
            ? "refused"
            : selected || d
              ? "selected"
              : hover === p.item.id && camera !== "walk"
                ? "hover"
                : null;
        return (
          <group key={p.item.id}>
            {d && (
              <group position={[p.item.x, p.y, p.item.z]} rotation={[0, p.item.rotY, 0]}>
                <Outline shape={p.shape} tone="ghost" dark={evening} />
              </group>
            )}
            <group
              position={[item.x, p.y + (d ? LIFT : 0), item.z]}
              rotation={[0, item.rotY, 0]}
              onPointerDown={(e) => onDown(e, p)}
              onPointerOver={(e) => {
                if (onGrip(e)) return;
                e.stopPropagation();
                // A held height grip keeps its cursor while the pointer crosses other pieces.
                if (camera === "walk" || readOnly || viewStore.getState().lift) return;
                document.body.style.cursor = "grab";
                viewStore.setState({ hover: p.item.id });
              }}
              onPointerOut={() => {
                if (!viewStore.getState().lift) document.body.style.cursor = "";
                if (viewStore.getState().hover === p.item.id) viewStore.setState({ hover: null });
              }}
              name={`item-${p.item.id}`}
            >
              <TableBody
                shape={p.shape}
                linen={linens.get(styleOf(p.item, scenario.style).linen) ?? null}
                lap={lap}
                m={m}
                segments={segments}
                evening={evening}
              />
              {tone && camera !== "walk" && <Outline shape={p.shape} tone={tone} dark={evening} />}
              {showLabels && labels.get(p.item.id) && (
                <Html center position={[0, 1.0, 0]} zIndexRange={[10, 0]} className="table-label">
                  {labels.get(p.item.id)}
                </Html>
              )}
              {/* The dance area is only a mark on the floor; in plan it says what it is. */}
              {showLabels && p.shape.kind === "danceFloor" && (
                <Html center position={[0, 0.1, 0]} zIndexRange={[10, 0]} className="table-label">
                  Dance area
                </Html>
              )}
            </group>
          </group>
        );
      })}
      <Chairs placed={placed} scenario={scenario} low={quality === "low"} />
      <TableContacts placed={placed} decor={decor} m={m} />
      <TableDecor decor={decor} m={m} evening={evening} low={quality === "low"} detail={detail} />
      {/* Its own loading step: a plant's model arrives a moment after it is placed, not with the room. */}
      <Suspense fallback={null}>
        <PieceModels decor={decor} low={quality === "low"} />
      </Suspense>
      {/* Touch rotates with the inspector buttons; a 3D handle is too small a target there. */}
      {single && camera !== "walk" && !coarse && !spotFor(single.item, venue) && !drag && (
        <RotateHandle
          dark={evening}
          placed={single}
          onDown={(e) => beginDrag("rotate", [single.item.id], e, single.y, [single.item.x, single.item.z])}
        />
      )}
      {single && camera !== "walk" && !drag && (
        // The grip only in the dollhouse: from straight above (plan) a drag would change an unseen height.
        <HeightHandle
          placed={single}
          dark={evening}
          grab={!coarse && camera === "dollhouse"}
          setControls={setControls}
        />
      )}
      {drag && (
        <Guides drag={drag} y={placed.find((p) => p.item.id === drag.ids[0])?.y ?? 0} dark={evening} />
      )}
      {drag && <DragLabel drag={drag} placed={placed} />}
      <SeatPicker placed={placed} />
    </group>
  );
}

/**
 * Sit here (CAM-04): after "Sit here" on a table, each of its chairs offers a seat; choosing one
 * moves the camera there, at seated eye height, facing the table.
 */
function SeatPicker({ placed }: { placed: Placed[] }) {
  const { editor } = useStudio();
  const id = useView((s) => s.pickSeat);
  const p = id ? placed.find((x) => x.item.id === id) : undefined;
  if (!p) return null;
  return (
    <group name="seats">
      {chairsWorld(p.item, p.shape).map((ch, i) => (
        <Html key={i} center position={[ch.x, p.y + 0.55, ch.z]} zIndexRange={[9, 0]}>
          <button
            type="button"
            className="seat-pick"
            aria-label={`Sit in seat ${i + 1}`}
            data-testid={`seat-${i + 1}`}
            onClick={() => {
              viewStore.setState({
                pickSeat: null,
                seat: {
                  x: ch.x,
                  y: p.y,
                  z: ch.z,
                  look: [p.item.x, p.item.z],
                  table: p.item.id,
                  from: editor.store.getState().camera,
                },
              });
              editor.select([]);
              editor.setCamera("walk");
            }}
          >
            {/* A chair glyph (scene code keeps its own; ui icons are out of its layer). */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M7 3v9M17 3v9M7 7h10M5 12h14v3H5zM7 15v6M17 15v6" />
            </svg>
          </button>
        </Html>
      ))}
    </group>
  );
}

/** A press on a light's height grip belongs to the grip, even through the light in front of it. */
const onGrip = (e: ThreeEvent<PointerEvent>) => e.intersections.some((i) => i.object.name === "height-grip");

/** The grip's radius and its hit area's, in screen pixels (§2.5: 44 pt targets), and how far under the light it sits (m). */
const GRIP_PX = 7;
const GRIP_HIT_PX = 22;
const GRIP_DROP = 0.08;

/**
 * A hanging or ceiling light's height (LIB-08, owner 2026-10-17): a line drops from it to the floor
 * with its height beside it, and in the dollhouse on desktop a grip just under the light drags it
 * up or down between its limits. The light follows while dragging (`lift`); release saves it as
 * one change (one undo step); Escape puts it back.
 */
function HeightHandle({
  placed,
  dark,
  grab,
  setControls,
}: {
  placed: Placed;
  dark: boolean;
  grab: boolean;
  setControls: (enabled: boolean) => void;
}) {
  const { catalog, editor } = useStudio();
  const get = useThree((s) => s.get);
  const toPlane = useFloorPointer();
  const grip = useRef<THREE.Group>(null);
  const colours = useMemo(
    () => ({
      line: dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b"),
      halo: token("--ink", "#202522"),
    }),
    [dark],
  );
  // The grip keeps its size on screen, however far the camera is.
  const probe = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
  useFrame(({ camera, size }) => {
    const g = grip.current;
    if (!g) return;
    const a = g.getWorldPosition(probe.a);
    const b = probe.b.copy(a).setY(a.y + 1);
    const perMetre = Math.abs(a.project(camera).y - b.project(camera).y) * (size.height / 2);
    g.scale.setScalar(perMetre > 0 ? 1 / perMetre : 1);
  });
  useEffect(() => () => void (document.body.style.cursor = ""), []);
  // Where the light really ends (a sagging strand, a mirror ball below its hanging point).
  const bottom = useMemo(() => {
    const s = placed.shape;
    return s.kind === "piece" ? bottomOf(makePiece(s.generator, s.params, s.options, s.size).parts) : 0;
  }, [placed.shape]);
  const entry = catalog.get(placed.item.libraryId);
  const option = entry?.options.find((o) => o.key === "hang");
  if (!entry || !hangingLight(entry) || option?.type !== "number") return null;
  const h = Number(placed.item.options.hang ?? option.default);
  const { x, z } = placed.item;
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button > 0) return;
    e.stopPropagation();
    setControls(false);
    const saved = h;
    const { camera } = get();
    // A vertical plane through the light, facing the camera: the pointer's height on it moves the
    // light by as much, from wherever on the grip it was pressed (no jump on a press).
    const facing = new THREE.Vector3()
      .subVectors(camera.position, new THREE.Vector3(x, 0, z))
      .setY(0)
      .normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, new THREE.Vector3(x, 0, z));
    const start = toPlane(e.clientX, e.clientY, plane)?.y;
    let last = saved;
    const move = (ev: PointerEvent) => {
      const y = toPlane(ev.clientX, ev.clientY, plane)?.y;
      if (y === undefined || start === undefined) return;
      last = Math.min(option.max, Math.max(option.min, snap(saved + y - start, option.step)));
      viewStore.setState({ lift: { id: placed.item.id, hang: last } });
    };
    const end = (save: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      document.body.style.cursor = "";
      setControls(true);
      viewStore.setState({ lift: null });
      if (save && Math.abs(last - saved) > 1e-3) editor.setOption(placed.item.id, "hang", last);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    // Escape here only puts the height back (read first, so the selection stays).
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      end(false);
    };
    document.body.style.cursor = "ns-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
  };
  const top = placed.y + bottom;
  const line = (width: number, c: string, opacity: number, order: number) => (
    <Line
      points={[
        [x, placed.y + 0.01, z],
        [x, top, z],
      ]}
      color={c}
      lineWidth={width}
      dashed
      dashSize={0.12}
      gapSize={0.08}
      depthTest={false}
      renderOrder={order}
      opacity={opacity}
    />
  );
  return (
    <group name="height-handle">
      {/* A dark halo under the line, so it reads on pale cloths in the evening. */}
      {line(3.5, colours.halo, 0.45, 11)}
      {line(1.5, colours.line, 1, 12)}
      <mesh position={[x, placed.y + 0.006, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={12}>
        <ringGeometry args={[0.06, 0.1, 24]} />
        <meshBasicMaterial color={colours.line} depthTest={false} transparent />
      </mesh>
      {grab && (
        <group ref={grip} position={[x, top - GRIP_DROP, z]}>
          <mesh renderOrder={13}>
            <sphereGeometry args={[GRIP_PX + 1.5, 16, 12]} />
            <meshBasicMaterial color={colours.halo} depthTest={false} transparent opacity={0.6} />
          </mesh>
          <mesh renderOrder={14}>
            <sphereGeometry args={[GRIP_PX, 16, 12]} />
            <meshBasicMaterial color={colours.line} depthTest={false} transparent />
          </mesh>
          <mesh
            name="height-grip"
            onPointerDown={onDown}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "ns-resize";
            }}
            onPointerOut={() => {
              if (!viewStore.getState().lift) document.body.style.cursor = "";
            }}
          >
            <sphereGeometry args={[GRIP_HIT_PX, 8, 6]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </group>
      )}
      <Html position={[x, placed.y + bottom / 2, z]} className="height-readout" zIndexRange={[5, 0]}>
        ≈ {h.toFixed(1)} m
      </Html>
    </group>
  );
}

function RotateHandle({
  placed,
  onDown,
  dark,
}: {
  placed: Placed;
  onDown: (e: ThreeEvent<PointerEvent>) => void;
  dark: boolean;
}) {
  const { catalog } = useStudio();
  const colours = useMemo(
    () => ({
      accent: dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b"),
      mark: dark ? token("--ink", "#202522") : token("--on-dark", "#ffffff"),
    }),
    [dark],
  );
  const reach = useMemo(
    () => Math.max(...footprint({ ...placed.item, x: 0, z: 0, rotY: 0 }, catalog).map(([x]) => x)) + 0.35,
    [placed, catalog],
  );
  const c = Math.cos(placed.item.rotY);
  const s = Math.sin(placed.item.rotY);
  return (
    <group position={[placed.item.x + reach * c, placed.y + 0.05, placed.item.z - reach * s]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDown(e);
        }}
        onPointerOver={() => (document.body.style.cursor = "alias")}
        onPointerOut={() => (document.body.style.cursor = "")}
        name="rotate-handle"
        renderOrder={12}
      >
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial color={colours.accent} transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={13}>
        <ringGeometry args={[0.08, 0.12, 24, 1, 0.4, Math.PI * 1.5]} />
        <meshBasicMaterial color={colours.mark} depthTest={false} transparent />
      </mesh>
    </group>
  );
}

/**
 * Live readout above the dragged item (DESIGN_GUIDE §5): the refusal reason when the move is
 * refused, else its distance from the glass-door and back-bar walls, or the angle while rotating.
 */
function DragLabel({ drag, placed }: { drag: Drag; placed: Placed[] }) {
  const p = placed.find((x) => x.item.id === drag.ids[0]);
  if (!p) return null;
  const x = p.item.x + drag.dx;
  const z = p.item.z + drag.dz;
  const deg = Math.round(((((p.item.rotY + drag.dRot) * 180) / Math.PI) % 360) + 360) % 360;
  const text =
    !drag.valid && drag.reason
      ? drag.reason
      : drag.kind === "rotate"
        ? `${deg}°`
        : `≈ ${x.toFixed(1)} m · ${z.toFixed(1)} m`;
  return (
    <Html
      position={[x, p.y + 0.2, z]}
      center
      className={drag.valid ? "drag-readout" : "drag-reason"}
      zIndexRange={[20, 10]}
    >
      {text}
    </Html>
  );
}
