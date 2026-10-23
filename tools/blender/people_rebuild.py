"""A placed guest rebuilt as the app's clean figures (visual stage V7).

venv/bin/python people_rebuild.py <posed.glb> <out.glb> [voxel=0.0035] [legs=<m>] [front=<m>]

- The placed Meshy mesh (`people_seated.py`, `people_standing.py`) is never smoothed or simplified
  itself: it is remeshed into one closed surface (`voxel` m), which is then simplified to each detail
  level: `detail` 14,000 triangles (about half Meshy's; owner, 2026-10-22: the closest guests at
  about half the original's quality), `medium` 1,200, `simple` 540 (the people budget in
  VISUAL_STATUS.md: medium light enough for every guest in a close overview to afford it).
- Colour comes from the Meshy texture into two small textures per level (`TILES` texels, saved
  beside the GLB as `.npz` for `people_pack.py`): the parts (outfit, skin, hair weights; none, drawn
  as is) and the shade (0.5 the part's average; the colour itself for shirt, tie, shoes). The app
  recolours outfit, skin and hair per guest, keeping their shading.
- Parts are decided once on the dense closed surface (specks cleaned, borders smoothed, a dress's
  hem cut straight) and kept through simplification (their borders collapse least); each level is
  unwrapped (xatlas) and each texel reads the dense surface's part and shade, so a border follows
  the figure, not the triangles. Needs `pip install xatlas` beside bpy.
- `legs` (a dress's hem height) and `front` (seated: the thighs past the hem, Blender y): bare legs
  there, and no tie.
"""
import colorsys
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
import xatlas
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from mathutils.kdtree import KDTree

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
voxel = float(opts.get("voxel", "0.0035"))
# A dress: bare legs below `legs` m (its hem), and no tie to keep as it is (navy would read as one).
legs = float(opts.get("legs", "0"))
# Seated in a dress: bare legs also ahead of `front` (Blender y, the thighs past the hem), below 0.6 m.
front = float(opts.get("front", "-9"))
dress = legs > 0


def bare(x, y, z):
    return z <= legs or (y <= front and z < 0.6)
LEVELS = {"detail": 14000, "medium": 1200, "simple": 540}
# Each level's texture (texels a side; the levels seen close finer) and the texels kept clear at its
# edges.
TILES = {"detail": 1024, "medium": 512, "simple": 256}
MARGIN = 4
# The dense surface a texel reads (m around it; finer textures read less), and how far from it a
# level's surface may lie.
VOTES = {"detail": 0.007, "medium": 0.01, "simple": 0.012}
RAY = 0.03
# Texels a triangle writes beyond its edges.
PAD = 1.5
tiles = {}
BORDER_WEIGHT = float(opts.get("border", "0.2"))
SMOOTH = int(opts.get("smooth", "24"))

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
# Borders smoothed (owner, 2026-10-22: a tie's or a neckline's edge read as torn): each class's
# share diffused over its neighbours (`SMOOTH` passes, about 2 cm), each vertex taking the largest;
# the hem stays where it was cut. A vertex that changed class takes its new class's colour below.
share = np.eye(6)[cls]
deg = np.bincount(edges.ravel(), minlength=len(cls))[:, None] + 1.0
for _ in range(SMOOTH):
    acc = share.copy()
    np.add.at(acc, edges[:, 0], share[edges[:, 1]])
    np.add.at(acc, edges[:, 1], share[edges[:, 0]])
    share = acc / deg
smoothed = share.argmax(1)
if dress:
    # Bare legs below the hem; above it, near it, no skin grows from them.
    smoothed[[bare(*p) and c != 5 for p, c in zip(D, smoothed)]] = 1
    near = [bare(*p) or bare(p[0], p[1] - 0.1, p[2] - 0.1) for p in D]
    smoothed[[n and not bare(*p) and c == 1 and k != 1 for n, p, c, k in zip(near, D, smoothed, cls)]] = 0
moved |= smoothed != cls
cls = smoothed
# A speck takes its new class's colour too, from the neighbours it joined, filling inwards.
while True:
    todo = [v for v in np.flatnonzero(moved) if any(not moved[w] and cls[w] == cls[v] for w in nbrs[v])]
    if not todo:
        break
    for v in todo:
        cols[v] = np.mean([cols[w] for w in nbrs[v] if not moved[w] and cls[w] == cls[v]], axis=0)
    moved[todo] = False
lum = cols @ np.array([0.2126, 0.7152, 0.0722])
# The texture's folds and painted shadows (owner, 2026-10-22: the fabric's rough look kept), only
# their speckle softened, within each class.
same = cls[edges[:, 0]] == cls[edges[:, 1]]
for _ in range(4):
    acc, cnt = lum.copy(), np.ones(len(lum))
    acc_c = cols.copy()
    for e in (edges[same], edges[same][:, ::-1]):
        np.add.at(acc, e[:, 0], lum[e[:, 1]])
        np.add.at(acc_c, e[:, 0], cols[e[:, 1]])
        np.add.at(cnt, e[:, 0], 1)
    lum = acc / cnt
    # What is drawn as is (shirt, tie, shoes) softened alike.
    cols = acc_c / cnt[:, None]
value = np.zeros((len(cls), 3), dtype=np.float32)
for k in range(6):
    sel = cls == k
    if not sel.any():
        continue
    if PART[k] == 3:
        value[sel] = srgb_to_linear(cols[sel])
    else:
        value[sel] = (np.clip(lum[sel] / max(1e-3, lum[sel].mean()), 0.6, 1.4) * 0.5)[:, None]
dense_tree = BVHTree.FromPolygons([tuple(v) for v in D], [tuple(p.vertices) for p in me.polygons])
dense_kd = KDTree(len(D))
for i, v in enumerate(D):
    dense_kd.insert(v, i)
dense_kd.balance()
# Simplification keeps the class borders: their vertices collapse least (the decimate weight).
weight = work.vertex_groups.new(name="collapse")
weight.add(list(range(len(cls))), 1.0, "REPLACE")
edge_idx = np.flatnonzero(cls[edges[:, 0]] != cls[edges[:, 1]])
weight.add(sorted(set(edges[edge_idx].ravel().tolist())), BORDER_WEIGHT, "REPLACE")
# The soles collapse last: every level's feet stay on the floor.
weight.add(np.flatnonzero(D[:, 2] < D[:, 2].min() + 0.01).tolist(), BORDER_WEIGHT / 4, "REPLACE")


def texel(p, n, vote):
    """A level's point `p` (normal `n`) read from the dense surface: found along the normal, facing
    the same way (a simpler level can pass under a tie or a lapel), then the dense surface around
    that point voting (within `vote` m, nearer counting more): the class most of it has, and that
    class's mean value. A vote, not one point, so a border stays smooth."""
    best = None
    for d in (n, -n):
        loc, normal, _, dist = dense_tree.ray_cast(p, d, RAY)
        if loc is not None and normal.dot(n) > 0 and (best is None or dist < best[1]):
            best = (loc, dist)
    if best:
        p = best[0]
    near = dense_kd.find_range(p, vote) or dense_kd.find_n(p, 4)
    idx = np.array([i for _, i, _ in near])
    wt = np.exp(-((np.array([d for _, _, d in near]) / (vote / 2)) ** 2))
    k = int(np.bincount(cls[idx], wt, minlength=6).argmax())
    sel = cls[idx] == k
    return k, (value[idx[sel]] * wt[sel, None]).sum(0) / wt[sel].sum()


def level(name, target, src):
    tile = TILES[name]
    o = src.copy()
    o.data = src.data.copy()
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
    for p in o.data.polygons:
        p.use_smooth = True
    # A face folded against its neighbours (or nearly: compressed normals could turn it over) would
    # be lit from behind when smoothed: it stays flat.
    for _ in range(50):
        cn = np.zeros(len(o.data.loops) * 3)
        o.data.corner_normals.foreach_get("vector", cn)
        cn = cn.reshape(-1, 3)
        folded = [p for p in o.data.polygons if p.use_smooth and np.dot(cn[list(p.loop_indices)].sum(0), p.normal) < 0.3]
        if not folded:
            break
        for p in folded:
            p.use_smooth = False
    # Unwrapped, each level's parts and shade go to a texture of its own (`TILES` texels): their borders
    # follow the figure, never the triangles (owner, 2026-10-22: no triangles in a neckline or a tie).
    # xatlas: large charts, tightly packed (Blender's smart project left hundreds of small islands
    # filling a sixth of the tile).
    atlas = xatlas.Atlas()
    atlas.add_mesh(np.array([v.co[:] for v in o.data.vertices], np.float32), np.array([p.vertices[:] for p in o.data.polygons], np.uint32))
    pack = xatlas.PackOptions()
    pack.resolution, pack.padding, pack.bilinear = tile, 2, True
    atlas.generate(xatlas.ChartOptions(), pack)
    _, corners, coords = atlas[0]
    # Kept off the tile's edge, so far (smaller) mip levels do not reach the next tile.
    uv = (MARGIN + coords[corners.ravel()] * (tile - 2 * MARGIN)) / tile
    layer = o.data.uv_layers.active or o.data.uv_layers.new()
    layer.data.foreach_set("uv", uv.ravel())
    X = np.array([v.co[:] for v in o.data.vertices])
    N = np.array([v.normal[:] for v in o.data.vertices])
    shade = np.zeros((tile, tile, 3), np.float32)
    parts = np.zeros((tile, tile, 3), np.float32)
    # Each texel's distance (texels) outside the triangle that wrote it: a triangle also writes the
    # texels just around it, so a sliver or an island's edge never shows a neighbouring island.
    outside = np.full((tile, tile), np.inf)
    for poly in o.data.polygons:
        P = uv[list(poly.loop_indices)] * tile - 0.5
        lo, hi = np.floor(P.min(0) - PAD).astype(int), np.ceil(P.max(0) + PAD).astype(int)
        xs, ys = np.meshgrid(np.arange(max(lo[0], 0), min(hi[0], tile - 1) + 1), np.arange(max(lo[1], 0), min(hi[1], tile - 1) + 1))
        q = np.stack([xs.ravel(), ys.ravel()], 1) - P[0]
        m = np.array([P[1] - P[0], P[2] - P[0]]).T
        if abs(np.linalg.det(m)) < 1e-12:
            continue
        w12 = np.linalg.solve(m, q.T).T
        w = np.column_stack([1 - w12.sum(1), w12])
        # Barycentric weight to texels: each corner's height over its opposite edge.
        height = abs(np.linalg.det(m)) / np.linalg.norm(P[[2, 0, 1]] - P[[1, 2, 0]], axis=1)
        out = np.maximum(0, (-w * height).max(1))
        x_all, y_all = xs.ravel(), ys.ravel()
        take = (out <= PAD) & (out < outside[y_all, x_all])
        a, b, c = poly.vertices
        for (wa, wb, wc), d, x, y in zip(w[take], out[take], x_all[take], y_all[take]):
            outside[y, x] = d
            k, shade[y, x] = texel(Vector(wa * X[a] + wb * X[b] + wc * X[c]), Vector(wa * N[a] + wb * N[b] + wc * N[c]).normalized(), VOTES[name])
            parts[y, x] = 0
            if PART[k] < 3:
                parts[y, x, PART[k]] = 1
    # Texels outside every island take their neighbours' values (no seam shows through filtering).
    filled = outside < np.inf
    while not filled.all():
        acc_s, acc_p, n = np.zeros_like(shade), np.zeros_like(parts), np.zeros((tile, tile))
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            f = np.roll(filled, (dy, dx), (0, 1))
            acc_s += np.where(f[..., None], np.roll(shade, (dy, dx), (0, 1)), 0)
            acc_p += np.where(f[..., None], np.roll(parts, (dy, dx), (0, 1)), 0)
            n += f
        grow = ~filled & (n > 0)
        shade[grow] = acc_s[grow] / n[grow, None]
        parts[grow] = acc_p[grow] / n[grow, None]
        filled |= grow
    tiles[name] = (shade, parts)
    print(name, "triangles", sum(len(p.vertices) - 2 for p in o.data.polygons))
    return o


# Each level simplified from the one before it (the dense surface, then the detailed level...): a
# coarse level straight from the dense one came out with slivers and pinched edges.
made = []
for n, t in LEVELS.items():
    made.append(level(n, t, made[-1] if made else work))
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
    export_texcoords=True,
    export_tangents=False,
    export_vertex_color="NONE",
    export_materials="NONE",
    export_animations=False,
    export_extras=False,
)
# The textures beside it, by level, as `people_pack.py` reads them: shade (linear) and parts.
np.savez_compressed(dst[: -len(".glb")] + ".npz", **{f"{n}-{k}": t[i] for n, t in tiles.items() for i, k in enumerate(("shade", "parts"))})
