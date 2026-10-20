"""A Meshy bloom made ready for the app (visual stage V5).

venv/bin/python bloom_from_meshy.py <meshy.glb> <out.glb> [stem] [front-up]

- `front-up`: turns a bloom Meshy made facing the front (no stem) to face up, as the app expects.
- `stem`: folds a stem the model came with up into a small flat stub under the head (the stem: down
  from the head's widest height, everything below where it narrows to a quarter of that width). Not
  cut away, so the topology stays the source's (`check:assets`).
- Fits the bloom into the box -1..1 by its largest side, centred on every axis, so the app scales it
  by the part's largest size (a sphere's radius) and keeps its own proportions.
- Faces turned outward (petals are thin shells; the app draws both sides), smooth normals within 80° and ambient occlusion baked into the vertex colour (linear 0.6 deep in a
  crease, 1 in the open), so a tinted bloom still shows its petals. No
  texture: the app tints each bloom with its arrangement's colour.
"""
import sys

import bpy
import numpy as np

src, out = sys.argv[1], sys.argv[2]
cut_stem = "stem" in sys.argv[3:]
front_up = "front-up" in sys.argv[3:]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
if front_up:
    obj.rotation_mode = "XYZ"  # the importer sets quaternions
    obj.rotation_euler = (-np.pi / 2, 0, 0)  # the front (-y in Blender) to the top (+z)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data

if cut_stem:
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co[:, 2].min(), co[:, 2].max()
    bands = np.linspace(lo, hi, 41)
    cx, cy = np.median(co[:, 0]), np.median(co[:, 1])
    widths = []
    for a, b in zip(bands[:-1], bands[1:]):
        sel = co[(co[:, 2] >= a) & (co[:, 2] < b)]
        widths.append(np.hypot(sel[:, 0] - cx, sel[:, 1] - cy).max() if len(sel) else 0.0)
    widths = np.array(widths)
    # Down from the widest band while the head stays a quarter as wide: below that is the stem.
    i = int(np.argmax(widths))
    while i > 0 and widths[i - 1] >= widths.max() / 4:
        i -= 1
    cut = bands[i]
    # Folded up into a small flat stub under the head, not deleted: the topology stays the source's.
    low = co[:, 2] < cut
    co[low, 0] = cx + (co[low, 0] - cx) * 0.3
    co[low, 1] = cy + (co[low, 1] - cy) * 0.3
    co[low, 2] = cut
    me.vertices.foreach_set("co", co.ravel())
    me.update()

co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
co = (co - (lo + hi) / 2) * (2 / (hi - lo).max())
me.vertices.foreach_set("co", co.ravel())
me.update()

# Petals are thin shells: point every face outward, so none shades as if lit from behind.
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth_by_angle(angle=np.radians(80))

# Ambient occlusion into the vertex colour (Cycles bake, a short reach for the bloom's size).
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 64
scene.world = bpy.data.worlds.new("w")
scene.world.light_settings.distance = 0.25
attr = me.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
me.color_attributes.active_color = attr
mat = bpy.data.materials.new("bloom")
mat.use_nodes = True
me.materials.clear()
me.materials.append(mat)
bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
ao = np.array([c.color[0] for c in attr.data])
shade = 0.6 + 0.4 * ao
attr.data.foreach_set("color", np.repeat(shade, 4).reshape(-1, 4).clip(0, 1).astype(np.float32).ravel())
for c in attr.data:
    c.color[3] = 1.0

obj.name = me.name = "bloom"
print("triangles", sum(len(p.vertices) - 2 for p in me.polygons), "ao mean", round(float(ao.mean()), 3))
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_normals=True,
    export_texcoords=False,
    export_tangents=False,
    export_vertex_color="ACTIVE",
    export_materials="NONE",
    export_animations=False,
    export_extras=False,
)
