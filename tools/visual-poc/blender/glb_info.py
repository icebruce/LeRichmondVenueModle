import bpy, sys
from collections import Counter
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
c = Counter()
tris = Counter()
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        c[o.name.split(".")[0]] += 1
        tris[o.name.split(".")[0]] += len(o.data.polygons)
print("GROUPS", dict(c))
print("POLYS", dict(tris))
mats = Counter(m.name for m in bpy.data.materials)
print("MATS", len(mats), list(mats)[:40])
print("IMAGES", [(i.name, i.size[:]) for i in bpy.data.images][:30])
