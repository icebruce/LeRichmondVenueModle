"""A placed guest rebuilt as the app's clean figures (visual stage V7).

venv/bin/python people_rebuild.py <posed.glb> <out.glb> [voxel=0.005] [legs=<m>] [front=<m>]

- The placed Meshy mesh (`people_seated.py`, `people_standing.py`) is never smoothed or simplified
  itself: it is remeshed into one closed surface (`voxel` m), which is then simplified to each detail
  level: `detail` 8,000 triangles, `medium` 2,000, `simple` 540 (the people budget in
  VISUAL_STATUS.md: 150 guests on a phone, 12 medium and the rest simple, stay under 100k).
- Colour comes from the Meshy texture into the vertex colour: no texture at all. Its alpha holds the
  part (0 outfit, 1/3 skin, 2/3 hair, 1 as is): the app recolours outfit, skin and hair per guest,
  keeping their shading (rgb then holds the shade, 0.5 the part's average), and draws the rest
  (shirt, tie, shoes) as it is.
- Parts are decided once on the dense closed surface (specks cleaned, a dress's hem cut straight)
  and kept through simplification (their borders collapse least); each level's triangle takes one
  part, the dense surface's at its middle, so no triangle blends two palette colours.
- `legs` (a dress's hem height) and `front` (seated: the thighs past the hem, Blender y): bare legs
  there, and no tie.
"""
import colorsys
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from mathutils.kdtree import KDTree

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
voxel = float(opts.get("voxel", "0.005"))
# A dress: bare legs below `legs` m (its hem), and no tie to keep as it is (navy would read as one).
legs = float(opts.get("legs", "0"))
# Seated in a dress: bare legs also ahead of `front` (Blender y, the thighs past the hem), below 0.6 m.
front = float(opts.get("front", "-9"))
dress = legs > 0


def bare(x, y, z):
    return z <= legs or (y <= front and z < 0.6)
LEVELS = {"detail": 8000, "medium": 2000, "simple": 540}
BORDER_WEIGHT = float(opts.get("border", "0.2"))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
body = next(o for o in sc.objects if o.type == "MESH" and o.name.startswith("guest"))

# The source for colour: triangulated, its texture as an array.
src_bm = bmesh.new()
src_bm.from_mesh(body.data)
src_bm.transform(body.matrix_world)
bmesh.ops.triangulate(src_bm, faces=src_bm.faces)
src_bm.faces.ensure_lookup_table()
uv_layer = src_bm.loops.layers.uv.active
tree = BVHTree.FromBMesh(src_bm)
mat = body.data.materials[0]
img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
W, H = img.size
pixels = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)


def sample(p):
    loc, _, fi, _ = tree.find_nearest(p)
    f = src_bm.faces[fi]
    a, b, c = (lp.vert.co for lp in f.loops)
    # Barycentric weights of the nearest point in its triangle.
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01 or 1e-12
    wb = (d11 * d20 - d01 * d21) / den
    wc = (d00 * d21 - d01 * d20) / den
    uv = f.loops[0][uv_layer].uv * (1 - wb - wc) + f.loops[1][uv_layer].uv * wb + f.loops[2][uv_layer].uv * wc
    x = min(W - 1, max(0, int((uv.x % 1) * W)))
    y = min(H - 1, max(0, int((uv.y % 1) * H)))
    return pixels[y, x, :3]


# One closed surface, then each detail level from it.
work = body.copy()
work.data = body.data.copy()
sc.collection.objects.link(work)
for o in sc.objects:
    o.select_set(False)
bpy.context.view_layer.objects.active = work
work.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
rm = work.modifiers.new("remesh", "REMESH")
rm.mode = "VOXEL"
rm.voxel_size = voxel
bpy.ops.object.modifier_apply(modifier="remesh")
# Specks the remesher leaves off the body (a strand of hair, a fingertip's tip) are dropped.
bm = bmesh.new()
bm.from_mesh(work.data)
seen = set()
for f0 in bm.faces:
    if f0 in seen:
        continue
    island, todo = [], [f0]
    seen.add(f0)
    while todo:
        f = todo.pop()
        island.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen:
                    seen.add(g)
                    todo.append(g)
    if len(island) < 200:
        bmesh.ops.delete(bm, geom=island, context="FACES")
bm.to_mesh(work.data)
bm.free()
top = max(v.co.z for v in work.data.vertices)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


# Classes: the app's parts 0 outfit, 1 skin, 2 hair, and drawn as is: 3 shirt, 4 tie, 5 shoes (kept
# apart so a tie's highlight read as shirt is cleaned up like any other speck).
PART = np.array([0, 1, 2, 3, 3, 3])


def classify(rgb, p, head_line):
    z = p[2]
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    hue = h * 360
    if z < 0.13 and v < 0.3:
        return 5  # shoes
    if bare(*p):
        return 1  # bare legs
    if s < 0.2 and v > 0.6:
        return 3  # white shirt
    if not dress and 190 < hue < 260 and s > 0.25 and v > 0.15:
        return 4  # tie
    if 5 < hue < 50 and s > 0.15 and v >= 0.62:
        return 1
    if z > head_line and ((0 <= hue < 55 and s > 0.15 and v < 0.62) or v < 0.12):
        return 2
    return 0


# Parts are decided once, on the dense closed surface, and kept through every level: their borders
# follow the figure, not the triangles a simplification leaves. A dress's hem is cut straight first.
if dress:
    bm = bmesh.new()
    bm.from_mesh(work.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, legs), plane_no=(0, 0, 1))
    if front > -9:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, front, 0), plane_no=(0, 1, 0))
    bm.to_mesh(work.data)
    bm.free()
me = work.data
D = np.array([v.co[:] for v in me.vertices])
# The head: its top 24 cm (hair and face; the shoulders start below).
head_line = top - 0.24
# Texture pixels come as stored (sRGB): parts are told apart there; glTF vertex colour is linear.
cols = np.array([sample(v.co) for v in me.vertices])
cls = np.array([classify(c, p, head_line) for c, p in zip(cols, D)])
edges = np.array([e.vertices[:] for e in me.edges])
nbrs = [[] for _ in cls]
for a, b in edges:
    nbrs[a].append(b)
    nbrs[b].append(a)
# Specks (an ankle read as skin, a highlight on a tie read as shirt) join the class around them.
seen = np.zeros(len(cls), bool)
moved = np.zeros(len(cls), bool)
for v0 in range(len(cls)):
    if seen[v0] or cls[v0] == 0:
        continue
    comp, todo = [], [v0]
    seen[v0] = True
    while todo:
        v = todo.pop()
        comp.append(v)
        for w in nbrs[v]:
            if not seen[w] and cls[w] == cls[v0]:
                seen[w] = True
                todo.append(w)
    if len(comp) < max(3, 0.002 * len(cls)):
        around = [cls[w] for v in comp for w in nbrs[v] if cls[w] != cls[v0]]
        if around:
            cls[comp] = np.bincount(around).argmax()
            moved[comp] = True
# A speck takes its new class's colour too, from the neighbours it joined, filling inwards.
while True:
    todo = [v for v in np.flatnonzero(moved) if any(not moved[w] and cls[w] == cls[v] for w in nbrs[v])]
    if not todo:
        break
    for v in todo:
        cols[v] = np.mean([cols[w] for w in nbrs[v] if not moved[w] and cls[w] == cls[v]], axis=0)
    moved[todo] = False
part = PART[cls]
lum = cols @ np.array([0.2126, 0.7152, 0.0722])
# The texture's folds and painted shadows (owner, 2026-10-22: the fabric's rough look kept), only
# their speckle softened, within each class.
same = cls[edges[:, 0]] == cls[edges[:, 1]]
for _ in range(4):
    acc, cnt = lum.copy(), np.ones(len(lum))
    for e in (edges[same], edges[same][:, ::-1]):
        np.add.at(acc, e[:, 0], lum[e[:, 1]])
        np.add.at(cnt, e[:, 0], 1)
    lum = acc / cnt
value = np.zeros((len(cls), 4), dtype=np.float32)
for k in range(6):
    sel = cls == k
    if not sel.any():
        continue
    if PART[k] == 3:
        value[sel, :3] = srgb_to_linear(cols[sel])
    else:
        value[sel, :3] = (np.clip(lum[sel] / max(1e-3, lum[sel].mean()), 0.6, 1.4) * 0.5)[:, None]
    value[sel, 3] = PART[k] / 3
# Each dense face's class (the most of its corners'; below a hem, bare leg or shoe), for the levels.
dense_tri = []
dense_cls = []
for p in me.polygons:
    c = cls[list(p.vertices)]
    k = np.bincount(c, minlength=6).argmax()
    if dress and k != 5 and bare(*(p.center - Vector((0, 1e-6, 1e-6)))):
        k = 1
    for i in range(1, len(p.vertices) - 1):
        dense_tri.append((p.vertices[0], p.vertices[i], p.vertices[i + 1]))
        dense_cls.append(k)
dense_cls = np.array(dense_cls)
dense_tree = BVHTree.FromPolygons([tuple(v) for v in D], dense_tri)
by_class = {}
for k in range(6):
    idx = np.flatnonzero(cls == k)
    if len(idx):
        t = KDTree(len(idx))
        for i, v in enumerate(idx):
            t.insert(D[v], i)
        t.balance()
        by_class[k] = (t, idx)
# Simplification keeps the class borders: their vertices collapse least (the decimate weight).
weight = work.vertex_groups.new(name="collapse")
weight.add(list(range(len(cls))), 1.0, "REPLACE")
edge_idx = np.flatnonzero(cls[edges[:, 0]] != cls[edges[:, 1]])
weight.add(sorted(set(edges[edge_idx].ravel().tolist())), BORDER_WEIGHT, "REPLACE")


def level(name, target):
    o = work.copy()
    o.data = work.data.copy()
    o.name = o.data.name = name
    sc.collection.objects.link(o)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = min(1.0, target / tris)
    dec.vertex_group = "collapse"
    for x in sc.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier="dec")
    # Closed and clean: no slivers (a collapse can leave some), no pin holes, faces outward.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # A collapse can fold two faces onto the same corners, a fin with no volume: both go.
    by_corners = {}
    for f in bm.faces:
        by_corners.setdefault(frozenset(v.index for v in f.verts), []).append(f)
    bmesh.ops.delete(bm, geom=[f for fs in by_corners.values() if len(fs) > 1 for f in fs], context="FACES_ONLY")
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=8)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.vertex_groups.clear()
    for p in o.data.polygons:
        p.use_smooth = True
    # A face folded against its neighbours would be lit from behind when smoothed: it stays flat.
    for _ in range(5):
        cn = np.zeros(len(o.data.loops) * 3)
        o.data.corner_normals.foreach_get("vector", cn)
        cn = cn.reshape(-1, 3)
        folded = [p for p in o.data.polygons if p.use_smooth and np.dot(cn[list(p.loop_indices)].sum(0), p.normal) < 0]
        if not folded:
            break
        for p in folded:
            p.use_smooth = False
    # One class per triangle, the dense surface's at its middle, so no triangle blends two palette
    # colours in the app; each corner takes the nearest dense value of that class.
    V = [v.co for v in o.data.vertices]
    corner = np.zeros((len(o.data.loops), 4), dtype=np.float32)
    counts = np.zeros(4, int)
    for p in o.data.polygons:
        k = int(dense_cls[dense_tree.find_nearest(p.center)[2]])
        t, idx = by_class.get(k) or by_class[0]
        counts[PART[k]] += 1
        for li, vi in zip(p.loop_indices, p.vertices):
            corner[li] = value[idx[t.find(V[vi])[1]]]
    attr = o.data.color_attributes.new("part", "FLOAT_COLOR", "CORNER")
    attr.data.foreach_set("color", corner.ravel())
    o.data.color_attributes.active_color = attr
    print(name, "triangles", sum(len(p.vertices) - 2 for p in o.data.polygons), "faces outfit/skin/hair/as-is", counts.tolist())
    return o


made = [level(n, t) for n, t in LEVELS.items()]
for o in list(sc.objects):
    if o not in made:
        bpy.data.objects.remove(o)
for o in made:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    use_selection=True,
    export_normals=True,
    export_texcoords=False,
    export_tangents=False,
    export_vertex_color="ACTIVE",
    export_active_vertex_color_when_no_material=True,
    export_materials="NONE",
    export_animations=False,
    export_extras=False,
)
