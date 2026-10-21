"""A guest generated standing by Meshy (no rig), placed for the app (visual stage V7).

venv/bin/python people_standing.py <meshy.glb> <out.glb> height=<m>

Owner, 2026-10-21: natural joints and hands, no mesh distortion; the rig distorted arms and hands,
so the standing guest is generated in its pose (`tools/meshy/prompts/*-standing-*.txt`). Scaled to
`height`, feet on the floor, centred over the origin, facing Blender -y (the app's +z). Writes the
textured mesh named `guest`; `people_rebuild.py` makes the app's levels from it.
"""
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split("=", 1) for a in sys.argv[3:])
height = float(opts["height"])

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
body = next(o for o in sc.objects if o.type == "MESH")
for o in sc.objects:
    o.select_set(o is body)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
P = np.array([v.co[:] for v in body.data.vertices])
k = height / (P[:, 2].max() - P[:, 2].min())
# Centred on the legs (an arm held forward does not move the figure off its place).
legs = P[P[:, 2] < P[:, 2].min() + 0.45 * (P[:, 2].max() - P[:, 2].min())]
centre = Vector(((legs[:, 0].min() + legs[:, 0].max()) / 2, (legs[:, 1].min() + legs[:, 1].max()) / 2, P[:, 2].min()))
body.data.transform(Matrix.Diagonal((k, k, k, 1)) @ Matrix.Translation(-centre))
body.name = "guest"
print("scale", round(k, 3), "height", height)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_image_format="JPEG",
                          export_jpeg_quality=92)
