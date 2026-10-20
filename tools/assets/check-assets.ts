// `npm run check:assets` (VISUAL_STATUS.md, asset quality bar): every GLB the app loads is checked
// as one welded mesh — no open or non-manifold edges beyond its source's, no zero-area or flipped
// triangles, triangle lists with normals only, triangle and texture budgets from its library entry,
// and contact with the floor or table it stands on. Seat contact comes with the people (V7).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { NodeIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { type TriMesh, bottom, edges, faces } from "./checks.ts";

const root = new URL("../..", import.meta.url).pathname;
const modelsDir = join(root, "public/assets/models");
/** Open and non-manifold edges each model's source already had (a processed model may not add any). */
const sources: Record<string, { openEdges: number; nonManifoldEdges: number }> = JSON.parse(
  readFileSync(join(root, "tools/assets/sources.json"), "utf8"),
);
/** Largest texture side: 2K desktop, 1K for a phone (`lowModel`) version. */
const MAX_TEXTURE = { desktop: 2048, phone: 1024 };
/** Contact tolerance (m): a piece on the floor, a seat or a table rests within this of it. */
const CONTACT = 0.005;

type Use = { id: string; phone: boolean; triangles: number; placement: string };

/** Which library entries load each GLB, with the budget and placement that applies. */
function uses(): Map<string, Use[]> {
  const out = new Map<string, Use[]>();
  const dir = join(root, "data/library");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    for (const e of JSON.parse(readFileSync(join(dir, f), "utf8")).items ?? []) {
      for (const [model, phone] of [
        [e.model, false],
        [e.lowModel, true],
      ] as const) {
        if (model?.kind !== "glb" && !model?.file) continue;
        const triangles = phone ? (e.budget?.phoneTriangles ?? e.budget?.triangles) : e.budget?.triangles;
        const list = out.get(model.file) ?? [];
        list.push({ id: e.id, phone, triangles, placement: e.placement });
        out.set(model.file, list);
      }
    }
  }
  return out;
}

function glbs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? glbs(join(dir, d.name)) : d.name.endsWith(".glb") ? [join(dir, d.name)] : [],
  );
}

/** Determinant of a column-major 4×4 matrix's rotation and scale: negative when it mirrors. */
const det3 = (m: number[]) =>
  (m[0] as number) * ((m[5] as number) * (m[10] as number) - (m[6] as number) * (m[9] as number)) -
  (m[4] as number) * ((m[1] as number) * (m[10] as number) - (m[2] as number) * (m[9] as number)) +
  (m[8] as number) * ((m[1] as number) * (m[6] as number) - (m[2] as number) * (m[5] as number));

/** Appends a triangle-list primitive to `into`, in world space. */
function append(
  into: Required<TriMesh> & { positions: number[]; indices: number[]; normals: number[] },
  p: Primitive,
  matrix: number[],
) {
  const pos = p.getAttribute("POSITION");
  const nor = p.getAttribute("NORMAL");
  if (!pos) return;
  const base = into.positions.length / 3;
  // Mirroring flips the winding: flip the normals with it, so the winding check still holds.
  const sign = det3(matrix) < 0 ? -1 : 1;
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    for (let r = 0; r < 3; r++)
      into.positions.push(
        (matrix[r] as number) * (v[0] as number) +
          (matrix[r + 4] as number) * (v[1] as number) +
          (matrix[r + 8] as number) * (v[2] as number) +
          (matrix[r + 12] as number),
      );
    // Normals are only compared by sign against the winding, so the rotation part is enough.
    nor?.getElement(i, v);
    for (let r = 0; r < 3; r++)
      into.normals.push(
        sign * [0, 1, 2].reduce((a, k) => a + (matrix[r + k * 4] as number) * (v[k] as number), 0),
      );
  }
  const idx = p.getIndices()?.getArray();
  for (let i = 0; i < (idx ? idx.length : pos.getCount()); i++)
    into.indices.push(base + (idx ? (idx[i] as number) : i));
}

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const byFile = uses();
const problems: string[] = [];
const files = glbs(modelsDir).map((path) => relative(join(root, "public"), path));
for (const file of byFile.keys())
  if (!files.includes(file.replace(/^\//, "")))
    problems.push(`${file}: used by the library but not in public/assets/models`);
for (const file of files) {
  const doc = await io.read(join(root, "public", file));
  // The whole model as one mesh: parts split by material still close against each other.
  const m = { positions: [] as number[], indices: [] as number[], normals: [] as number[] };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix() as unknown as number[];
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4)
        problems.push(`${file}: ${mesh.getName() || "a mesh"} is not a triangle list`);
      else if (!prim.getAttribute("NORMAL"))
        problems.push(`${file}: ${mesh.getName() || "a mesh"} has no normals`);
      else append(m, prim, matrix);
    }
  }
  const e = edges(m);
  const f = faces(m);
  const triangles = m.indices.length / 3;
  const source = sources[file] ?? { openEdges: 0, nonManifoldEdges: 0 };
  if (e.open > source.openEdges)
    problems.push(`${file}: ${e.open} open edges (its source has ${source.openEdges})`);
  if (e.nonManifold > source.nonManifoldEdges)
    problems.push(`${file}: ${e.nonManifold} non-manifold edges (its source has ${source.nonManifoldEdges})`);
  if (f.zeroArea) problems.push(`${file}: ${f.zeroArea} zero-area triangles`);
  if (f.flipped) problems.push(`${file}: ${f.flipped} flipped triangles`);
  const used = byFile.get(file) ?? byFile.get(`/${file}`) ?? [];
  if (!used.length) problems.push(`${file}: no library entry uses it`);
  for (const u of used) {
    if (!u.triangles) problems.push(`${file}: ${u.id} has no ${u.phone ? "phone " : ""}triangle budget`);
    else if (triangles > u.triangles)
      problems.push(
        `${file}: ${triangles} triangles over ${u.id}'s ${u.phone ? "phone " : ""}budget ${u.triangles}`,
      );
    const low = bottom(m);
    if (["floor", "table"].includes(u.placement) && Math.abs(low) > CONTACT)
      problems.push(`${file}: rests ${(low * 1000).toFixed(1)} mm off its ${u.placement} (${u.id})`);
    const max = u.phone ? MAX_TEXTURE.phone : MAX_TEXTURE.desktop;
    for (const t of doc.getRoot().listTextures()) {
      const [w = 0, h = 0] = t.getSize() ?? [];
      if (Math.max(w, h) > max)
        problems.push(`${file}: texture ${t.getName() || t.getURI()} ${w}×${h} over ${max}`);
    }
  }
}

if (problems.length) {
  console.error(`Asset check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Asset check passed (${files.length} models).`);
