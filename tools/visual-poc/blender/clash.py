import bpy, sys, numpy as np
from mathutils.bvhtree import BVHTree
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1]); chair = [o for o in bpy.context.scene.objects if o.type == "MESH"]
n0 = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=sys.argv[2]); guest = [o for o in bpy.context.scene.objects if o.type == "MESH" and o not in chair][0]
dg = bpy.context.evaluated_depsgraph_get()
G = np.array([(guest.matrix_world @ v.co)[:] for v in guest.data.vertices])
for c in chair:
    bvh = BVHTree.FromObject(c, dg)
    inside = []
    from mathutils import Vector
    for i, p in enumerate(G):
        loc, nrm, idx, d = bvh.find_nearest(Vector(p))
        if loc is not None and d < 0.25 and (Vector(p) - loc).dot(nrm) < 0:
            inside.append((i, d))
    if inside:
        P = G[[i for i, _ in inside]]
        print(c.name, "guest verts inside:", len(inside), "max depth %.3f" % max(d for _, d in inside),
              "z range %.2f-%.2f" % (P[:, 2].min(), P[:, 2].max()), "y range %.2f-%.2f" % (P[:, 1].min(), P[:, 1].max()))
    else:
        print(c.name, "no penetration")
print("guest bbox", G.min(0).round(2), G.max(0).round(2), "shoulder width", round(G[G[:,2]>1.0][:,0].ptp(),2))
