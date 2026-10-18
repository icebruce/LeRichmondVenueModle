import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        zs = [(o.matrix_world @ v.co) for v in o.data.vertices]
        print(o.name, "x", round(min(p.x for p in zs),3), round(max(p.x for p in zs),3), "y", round(min(p.y for p in zs),3), round(max(p.y for p in zs),3), "z", round(min(p.z for p in zs),3), round(max(p.z for p in zs),3))
