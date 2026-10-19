"""A Meshy chair made ready for the app (visual stage V4).

venv/bin/python chair_from_meshy.py <meshy.glb> <out.glb> <width> <back> <height> <front>

- Leaves the remesher's topology as it is: its fins (edges shared by three faces) and pin holes do
  not show, while removing and refilling them left jagged patches where the seat meets the frame.
  `check:assets` holds the result to no more open or non-manifold edges than the source
  (`tools/assets/sources.json`).
- Fits the chair: `width` and `height` in metres, centred on x, feet at 0, the seat front `front` m
  ahead of the chair's place and the backrest's front face `back` m behind it at seat-to-waist
  height, where a seated guest's back rests (the app's chairs face +z, Blender's -y).
- Replaces the colour map with a grey detail map at half strength (0.5 = the part's own average; the
  app doubles the tint), and writes `<out>-mask.png`: white where the texture shows the seat, black
  the frame (the prompts ask for dark wood or paint and pale fabric). The app tints and finishes
  each part per library entry from the mask, so one mesh draws the whole chair.
- No normal map: Meshy's was baked against the normals the repair replaces.
"""
import bpy
import math
import sys

import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, BACK, H, FRONT = (float(x) for x in sys.argv[3:7])
SIDE = 1024
MASK_SIDE = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Normals are computed from the repaired surface, not carried over from the source.
bpy.ops.mesh.customdata_custom_splitnormals_clear()
mat = obj.data.materials[0]
nodes = mat.node_tree.nodes
bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
colour_img = bsdf.inputs["Base Color"].links[0].from_node.image

obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
# Edges sharper than 60° stay hard (rails, slats, seat edges); the rest is smooth.
obj.data.set_sharp_from_angle(angle=math.radians(60))
me = obj.data

# Fit: width and height first, then depth so the seat runs from the front to the backrest.
co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
co = (co - [(lo[0] + hi[0]) / 2, lo[1], lo[2]]) * [W / (hi[0] - lo[0]), 1, H / (hi[2] - lo[2])]
band = (np.abs(co[:, 0]) < 0.08) & (co[:, 2] > 0.5 * H) & (co[:, 2] < 0.7 * H) & (co[:, 1] > co[:, 1].max() / 2)
co[:, 1] *= (FRONT + BACK) / co[band, 1].min()
co[:, 1] -= FRONT
me.vertices.foreach_set("co", co.ravel())
me.update()

# Frame or seat per texel, from the colour map's luminance: an Otsu split over the faces (weighted
# by area: the atlas's unused background would skew a split over texels), then a 5×5 majority to
# drop specks. Per texel, not per face, so the boundary follows the paint, not the triangles.
w, h = colour_img.size
px = np.array(colour_img.pixels[:]).reshape(h, w, 4)[:, :, :3]
lum = px @ [0.2126, 0.7152, 0.0722]
uv = me.uv_layers.active.data


def sample(u, v):
    return lum[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]


face_lum = np.array([np.mean([sample(*uv[i].uv) for i in p.loop_indices]) for p in me.polygons])
area = np.array([p.area for p in me.polygons])
hist, edges = np.histogram(face_lum, bins=256, range=(0, 1), weights=area)
best, split = -1.0, 0.5
for k in range(1, 256):
    a, b = hist[:k].sum(), hist[k:].sum()
    if not a or not b:
        continue
    ma = (hist[:k] * edges[:k]).sum() / a
    mb = (hist[k:] * edges[k:256]).sum() / b
    if a * b * (ma - mb) ** 2 > best:
        best, split = a * b * (ma - mb) ** 2, edges[k]
seat = lum > split
for _ in range(2):
    padded = np.pad(seat.astype(np.float32), 2, mode="edge")
    votes = sum(padded[2 + dy : h + 2 + dy, 2 + dx : w + 2 + dx] for dy in range(-2, 3) for dx in range(-2, 3))
    seat = votes > 12.5

# Texels no triangle covers (the atlas background) take their nearest covered neighbour's values, so
# downsampling and filtering never mix the background into an island's edge.
covered = np.zeros((h, w), bool)
for p in me.polygons:
    t = np.array([uv[i].uv[:] for i in p.loop_indices]) * [w, h]
    x0, y0 = np.floor(t.min(0)).astype(int)
    x1, y1 = np.ceil(t.max(0)).astype(int) + 1
    gx, gy = np.meshgrid(np.arange(max(x0, 0), min(x1, w)) + 0.5, np.arange(max(y0, 0), min(y1, h)) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = t
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-12:
        continue
    l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / d
    l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / d
    inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
    covered[gy[inside].astype(int), gx[inside].astype(int)] = True


def pad(values, mask, rounds=16):
    v, m = values.copy(), mask.copy()
    for _ in range(rounds):
        acc, n = np.zeros_like(v), np.zeros_like(v)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            mv = np.roll(m, (dy, dx), (0, 1))
            acc += np.where(mv, np.roll(v, (dy, dx), (0, 1)), 0)
            n += mv
        grow = ~m & (n > 0)
        v[grow] = acc[grow] / n[grow]
        m = m | grow
    return v


# Detail map: each texel against its part's average, softened and clamped, at half strength.
detail = np.empty_like(lum)
for m in (seat, ~seat):
    detail[m] = np.clip((lum[m] / max(lum[m].mean(), 1e-3)) ** 0.7, 0.15, 1.25)


def image(name, values, side, data=False):
    k = w // side
    v = values[: side * k, : side * k].reshape(side, k, side, k).mean(axis=(1, 3))
    img = bpy.data.images.new(name, side, side, is_data=data)
    img.pixels.foreach_set(np.dstack([v, v, v, np.ones_like(v)]).astype(np.float32).ravel())
    return img


img = image("detail", pad(np.clip(detail * 0.5, 0, 1), covered), SIDE)
mask = image("mask", pad(seat.astype(np.float32), covered), MASK_SIDE, data=True)
mask.filepath_raw = out.replace(".glb", "-mask.png")
mask.file_format = "PNG"
mask.save()

mat = bpy.data.materials.new("chair")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
mat.node_tree.links.new(tex.outputs["Color"], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
me.materials.clear()
me.materials.append(mat)
obj.name = me.name = "chair"
# Last resort for what folding left: a face its smooth normals point away from is drawn flat.
flat = 0
for _ in range(4):
    cn = me.corner_normals
    for p in me.polygons:
        if p.use_smooth and min(cn[i].vector.dot(p.normal) for i in p.loop_indices) <= 0:
            p.use_smooth = False
            flat += 1
    me.update()
print("triangles", len(me.polygons), "flat", flat, "seat share", round(float(seat.mean()), 3), "split", round(float(split), 3))
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_normals=True,
    export_texcoords=True,
    export_tangents=False,
    export_vertex_color="NONE",
    export_animations=False,
    export_extras=False,
)
