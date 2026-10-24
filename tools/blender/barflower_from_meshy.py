"""The Meshy blossom branch of the bar flowers made ready for the app (VEN-06).

venv/bin/python barflower_from_meshy.py <meshy.glb> <out.glb> <length>

- Keeps the remesher's topology (`check:assets` holds it to its source's edges).
- Puts the foot of the stem at the origin and turns the branch so its mass stands straight above
  it, then fits it to `length` metres high; the app leans each copy out of the vase from there.
- Keeps only the colour map, at 1K (white blossom and dark bark read by colour); one matte surface.
  The app draws both sides of its thin petals.
"""
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

src, out, L = sys.argv[1], sys.argv[2], float(sys.argv[3])
SIDE = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data

co = np.array([v.co[:] for v in me.vertices])
# The foot: the lowest 1% of the branch's height, where the cut stem ends.
lo, hi = co[:, 2].min(), co[:, 2].max()
foot = Vector(co[co[:, 2] < lo + (hi - lo) * 0.01].mean(0))
turn = (Vector(co.mean(0)) - foot).rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
top = max((turn @ (Vector(c) - foot)).z for c in co)
# As an object transform, so the normals turn with the branch.
obj.matrix_world = Matrix.Scale(L / top, 4) @ turn @ Matrix.Translation(-foot)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co = np.array([v.co[:] for v in me.vertices])

mat = me.materials[0]
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
colour = bsdf.inputs["Base Color"].links[0].from_node.image
colour.scale(SIDE, SIDE)
for name in ("Normal", "Metallic", "Roughness"):
    for link in list(bsdf.inputs[name].links):
        mat.node_tree.links.remove(link)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.8
obj.name = me.name = "barflower"
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
