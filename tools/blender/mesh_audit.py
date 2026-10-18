import bpy, bmesh, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
for o in bpy.context.scene.objects:
    if o.type != "MESH" or o.name.startswith("Ico"):
        continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    bm.verts.ensure_lookup_table()
    n = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    print(o.name, "open edges after welding coincident vertices:", sum(1 for e in bm.edges if e.is_boundary))
