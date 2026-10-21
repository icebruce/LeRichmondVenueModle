"""A posed guest rebuilt as the app's clean figures (visual stage V7).

venv/bin/python people_rebuild.py <posed.glb> <out.glb> [voxel=0.005]

- The posed Meshy mesh (`people_pose.py`) is never smoothed or simplified itself: it is remeshed into
  one closed surface (`voxel` m), which is then simplified to each detail level: `detail` 8,000
  triangles, `medium` 2,000, `simple` 600 (the people budget in VISUAL_STATUS.md).
- Colour comes from the Meshy texture, sampled at the nearest point of the posed mesh, into the
  vertex colour: no texture at all. Its alpha holds the part (0 outfit, 1/3 skin, 2/3 hair, 1 as
  is): the app recolours outfit, skin and hair per guest, keeping their shading (rgb then holds the
  shade, 0.5 the part's average), and draws the rest (shirt, tie, shoes, the glass) as it is.
- A `glass` in the posed file joins the detailed and medium figures as its own closed part.
"""
import colorsys
import sys

import bpy
import bmesh  # after bpy, which provides it
import numpy as np
from mathutils.bvhtree import BVHTree

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
voxel = float(opts.get("voxel", "0.005"))
LEVELS = {"detail": 8000, "medium": 2000, "simple": 600}
GLASS = (0.7, 0.78, 0.82)  # linear

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
body = next(o for o in sc.objects if o.type == "MESH" and o.name.startswith("guest"))
glass = next((o for o in sc.objects if o.type == "MESH" and o.name.startswith("glass")), None)

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
top = max(v.co.z for v in work.data.vertices)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


def classify(rgb, z, head_line):
    """Part per vertex: 0 outfit, 1 skin, 2 hair, 3 as is (shirt, tie, shoes)."""
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    hue = h * 360
    if s < 0.2 and v > 0.6:
        return 3  # white shirt
    if 190 < hue < 260 and s > 0.25 and v > 0.15:
        return 3  # tie
    if z < 0.13 and v < 0.3:
        return 3  # shoes
    if 5 < hue < 50 and s > 0.15 and v >= 0.62:
        return 1
    if z > head_line and 0 <= hue < 55 and s > 0.15 and 0.06 < v < 0.62:
        return 2
    return 0


def level(name, target):
    o = work.copy()
    o.data = work.data.copy()
    o.name = o.data.name = name
    sc.collection.objects.link(o)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = min(1.0, target / tris)
    for x in sc.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier="dec")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = True
    # Colour and part per vertex.
    head_line = top - 0.32
    # Texture pixels come as stored (sRGB): parts are told apart there; glTF vertex colour is linear.
    cols = np.array([sample(v.co) for v in o.data.vertices])
    parts = np.array([classify(c, v.co.z, head_line) for c, v in zip(cols, o.data.vertices)])
    edges = np.array([e.vertices[:] for e in o.data.edges])
    # Specks (an ankle read as skin, a collar's white on a shoulder) join the part around them.
    nbrs = [[] for _ in parts]
    for a, b in edges:
        nbrs[a].append(b)
        nbrs[b].append(a)
    seen = np.zeros(len(parts), bool)
    moved = np.zeros(len(parts), bool)
    for v0 in range(len(parts)):
        if seen[v0] or parts[v0] == 0:
            continue
        comp, todo = [], [v0]
        seen[v0] = True
        while todo:
            v = todo.pop()
            comp.append(v)
            for w in nbrs[v]:
                if not seen[w] and parts[w] == parts[v0]:
                    seen[w] = True
                    todo.append(w)
        if len(comp) < max(3, 0.006 * len(parts)):
            around = [parts[w] for v in comp for w in nbrs[v] if parts[w] != parts[v0]]
            if around:
                parts[comp] = np.bincount(around).argmax()
                moved[comp] = True
    # A speck takes its new part's colour too, from the neighbours it joined, filling inwards.
    while True:
        todo = [v for v in np.flatnonzero(moved) if any(not moved[w] and parts[w] == parts[v] for w in nbrs[v])]
        if not todo:
            break
        for v in todo:
            cols[v] = np.mean([cols[w] for w in nbrs[v] if not moved[w] and parts[w] == parts[v]], axis=0)
        moved[todo] = False
    lum = cols @ np.array([0.2126, 0.7152, 0.0722])
    # The texture's folds and painted shadows, softened: averaged with the neighbours of the same part.
    same = parts[edges[:, 0]] == parts[edges[:, 1]]
    for _ in range(3):
        acc, cnt = lum.copy(), np.ones(len(lum))
        for e in (edges[same], edges[same][:, ::-1]):
            np.add.at(acc, e[:, 0], lum[e[:, 1]])
            np.add.at(cnt, e[:, 0], 1)
        lum = acc / cnt
    out = np.zeros((len(cols), 4), dtype=np.float32)
    for k in range(4):
        sel = parts == k
        if not sel.any():
            continue
        if k == 3:
            out[sel, :3] = srgb_to_linear(cols[sel])
        else:
            shade = np.clip(lum[sel] / max(1e-3, lum[sel].mean()), 0.75, 1.25) * 0.5
            out[sel, :3] = shade[:, None]
        out[sel, 3] = k / 3
    if glass is not None and name != "simple":
        g = glass.copy()
        g.data = glass.data.copy()
        sc.collection.objects.link(g)
        n0 = len(o.data.vertices)
        for x in sc.objects:
            x.select_set(False)
        g.select_set(True)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.join()
        extra = len(o.data.vertices) - n0
        out = np.vstack([out, np.tile([*GLASS, 1.0], (extra, 1)).astype(np.float32)])
    attr = o.data.color_attributes.new("part", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", out.ravel())
    o.data.color_attributes.active_color = attr
    counts = [int((np.floor(out[:, 3] * 3 + 0.5) == k).sum()) for k in range(4)]
    print(name, "triangles", sum(len(p.vertices) - 2 for p in o.data.polygons), "outfit/skin/hair/as-is", counts)
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
