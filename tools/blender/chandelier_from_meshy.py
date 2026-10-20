"""A refined Meshy chandelier made ready for the app (visual stage V6).

venv/bin/python chandelier_from_meshy.py <meshy.glb> <out.glb> <height> <width>

- Keeps the remesher's topology (`check:assets` holds it to its source's edges).
- Fits the chandelier to `height` by `width` metres (top of its canopy to its lowest drop, and across),
  centred on x and z, its lowest point at 0; the app hangs it inside the venue's own cage.
- Keeps only the colour map, at 1K (bronze, crystal and ivory read by colour); one uniform metal
  and roughness for all of it. The app draws both sides of its thin bars.
"""
import sys

import bpy
import numpy as np

src, out, H, W = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
SIDE = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data

co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
side = max(hi[0] - lo[0], hi[1] - lo[1])
co = (co - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]) * [W / side, W / side, H / (hi[2] - lo[2])]
me.vertices.foreach_set("co", co.ravel())
me.update()

mat = me.materials[0]
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
colour = bsdf.inputs["Base Color"].links[0].from_node.image
colour.scale(SIDE, SIDE)
for name in ("Normal", "Metallic", "Roughness"):
    for link in list(bsdf.inputs[name].links):
        mat.node_tree.links.remove(link)
bsdf.inputs["Metallic"].default_value = 0.35
bsdf.inputs["Roughness"].default_value = 0.35
obj.name = me.name = "chandelier"
w = co.max(0) - co.min(0)
print("triangles", len(me.polygons), "size", [round(float(x), 2) for x in w])
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
